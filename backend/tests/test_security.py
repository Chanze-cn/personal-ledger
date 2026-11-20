from app.security import create_access_token, decode_access_token, hash_password, verify_password


def test_password_hash_round_trip():
    stored = hash_password("correct horse battery staple")
    assert stored != "correct horse battery staple"
    assert verify_password("correct horse battery staple", stored)
    assert not verify_password("wrong", stored)


def test_access_token_round_trip_and_tamper_detection():
    token = create_access_token(7, "alice", ttl_hours=1)
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == "7"
    assert payload["username"] == "alice"
    assert decode_access_token(token[:-1] + ("x" if token[-1] != "x" else "y")) is None
