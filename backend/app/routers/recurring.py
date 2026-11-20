import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import WRITE_LOCK, get_db
from ..deps import get_current_user
from ..models import RecurringTransaction, User
from ..routers.transactions import _resolve_leaf_category
from ..schemas import RecurringIn, RecurringOut, RecurringUpdate
from ..services.recurring import generate_due, serialize_template
from ..clock import today as local_today

router = APIRouter(prefix="/recurring", tags=["recurring"])


@router.get("", response_model=list[RecurringOut])
def list_recurring(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(RecurringTransaction).where(RecurringTransaction.user_id == user.id).order_by(RecurringTransaction.id.desc())).all()
    return [serialize_template(db, row) for row in rows]


@router.post("", response_model=RecurringOut)
def create_recurring(payload: RecurringIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    category = _resolve_leaf_category(db, user, payload.category_id)
    with WRITE_LOCK:
        item = RecurringTransaction(user_id=user.id, category_id=category.id, kind=category.kind,
            amount_cents=int(round(payload.amount * 100)), note=payload.note.strip(),
            frequency=payload.frequency, next_run_on=payload.next_run_on, is_active=True)
        db.add(item); db.commit(); db.refresh(item)
    return serialize_template(db, item)


@router.patch("/{template_id}", response_model=RecurringOut)
def update_recurring(template_id: int, payload: RecurringUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.get(RecurringTransaction, template_id)
    if item is None or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="周期模板不存在")
    with WRITE_LOCK:
        if payload.amount is not None: item.amount_cents = int(round(payload.amount * 100))
        if payload.note is not None: item.note = payload.note.strip()
        if payload.frequency is not None: item.frequency = payload.frequency
        if payload.next_run_on is not None: item.next_run_on = payload.next_run_on
        if payload.is_active is not None: item.is_active = payload.is_active
        db.commit(); db.refresh(item)
    return serialize_template(db, item)


@router.delete("/{template_id}")
def delete_recurring(template_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.get(RecurringTransaction, template_id)
    if item is None or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="周期模板不存在")
    with WRITE_LOCK:
        item.is_active = False
        db.commit()
    return {"ok": True, "message": "周期模板已停用"}


@router.post("/generate")
def generate_recurring(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    created, earliest = generate_due(db, user.id, local_today())
    return {"created": created, "from_date": earliest, "message": f"已生成 {created} 笔周期流水"}
