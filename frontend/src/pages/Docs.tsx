import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, ShieldCheck } from 'lucide-react';

const SECTIONS = [
  { id: 'intro', label: '产品简介' },
  { id: 'start', label: '快速开始' },
  { id: 'concepts', label: '核心概念' },
  { id: 'budget', label: '预算规则' },
  { id: 'security', label: '安全设计' },
  { id: 'api', label: '接口概览' },
  { id: 'faq', label: '常见问题' },
];

export default function Docs() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-slate-200/70 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2 text-[13px] text-slate-500 transition hover:text-ink">
            <ArrowLeft size={14} />
            返回官网
          </Link>
          <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <BookOpen size={15} className="text-brand" />
            使用文档
          </span>
          <Link to="/login" className="btn btn-primary px-3.5 py-2 text-[13px]">
            进入账本
          </Link>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-5xl gap-8 px-5 py-10 lg:grid-cols-[180px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-8 space-y-1">
            <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-slate-400">
              目录
            </p>
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="block rounded-lg px-3 py-1.5 text-[13px] text-slate-500 transition hover:bg-white hover:text-ink"
              >
                {section.label}
              </a>
            ))}
          </div>
        </aside>

        <article className="doc-body">
          <h1 className="text-[30px] font-semibold tracking-tight text-ink">Ledger 使用文档</h1>
          <p>
            一个本地可部署的个人记账系统：emoji 快速记账、周/月/年报表、两级预算体系，
            所有统计都由流水派生出的日 / 周 / 月 / 年切片计算。
          </p>

          <h2 id="intro">产品简介</h2>
          <p>
            后端 Python + FastAPI + SQLAlchemy，前端 React 18 + TypeScript + TailwindCSS，
            数据落在本地 SQLite（启用 WAL）。单端口启动后即可访问，不需要额外的数据库服务。
          </p>
          <table>
            <thead>
              <tr>
                <th>能力</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>记账</td>
                <td>
                  两级品类（一级分组 + 二级末级）、整页记账与 ⌘K 弹窗、今天/昨天/前天快捷日期
                </td>
              </tr>
              <tr>
                <td>报表</td>
                <td>周 / 月 / 年，含环比、同比、星期分布、日历热力图</td>
              </tr>
              <tr>
                <td>预算</td>
                <td>总预算 + 品类子预算，支持日/周/月/年与自定义周期</td>
              </tr>
              <tr>
                <td>任务</td>
                <td>切片重算异步执行，进度百分比与阶段说明可查</td>
              </tr>
            </tbody>
          </table>

          <h2 id="start">快速开始</h2>
          <pre>
            <code>{`./start.sh                 # 安装依赖 + 构建前端（首次）+ 启动服务
# 浏览器打开 http://127.0.0.1:8899`}</code>
          </pre>
          <p>
            系统不预置任何账号：在登录页点击「注册新账号」即可创建自己的账号，注册成功即登录并自动获得一套默认品类，
            不生成任何流水或预算。想快速体验报表效果，可在「设置 → 数据管理」一键生成示例数据。
          </p>

          <h2 id="concepts">核心概念</h2>
          <h3>流水是唯一事实来源</h3>
          <p>
            <code>transactions</code> 记录每一笔收支；<code>rollup_daily</code>（日×品类×方向）与{' '}
            <code>rollup_period</code>（周/月/年）是由流水推导出的切片，随时可重建。
          </p>
          <h3>异步重算</h3>
          <p>
            新增、编辑、删除流水都会提交一次重算任务，从受影响日期起刷新日切片，并级联刷新其所在及之后的周 / 月 / 年切片。
            任务中心可查看进度、阶段说明、耗时与失败原因，失败时可一键全量重建。
          </p>
          <h3>补偿巡检</h3>
          <p>
            每天 00:05 定时做当日切片；此外每 15 分钟巡检一次，若当日有流水但缺少切片则自动补算，避免漏算。
          </p>

          <h2 id="budget">预算规则</h2>
          <ul>
            <li>
              <b>总预算</b>：不绑定品类，约束该周期内的全部支出（或收入）。
            </li>
            <li>
              <b>品类子预算</b>：挂在某个总预算下，选一个品类即可；选一级品类表示按「整组」统计（含全部子品类），
              选二级子品类则精确到末级，周期自动继承父预算，保证执行窗口一致。
            </li>
            <li>
              <b>独立品类预算</b>：不挂父级，自带周期，适合单独盯某个品类。
            </li>
            <li>
              <b>额度取大值</b>：总预算的生效额度 = max(总预算填写额度, 品类子预算额度合计)。当子预算合计超过总预算时，
              卡片会提示「品类预算合计已超过总预算，按合计执行」，进度条以生效额度为分母。
              子预算按一级品类分组展示：同一组内同时有「整组预算」和「子品类预算」时，
              该组额度 = max(整组预算, 该组子预算合计)，各组额度相加才是「品类子预算额度合计」。
            </li>
            <li>
              <b>已用金额</b>：直接扫描流水统计，不受异步切片延迟影响；同周期内总预算已用金额不会因子预算重复计算。
            </li>
            <li>
              <b>每日可用</b>：剩余额度 ÷ 本期剩余天数，用于控制节奏。
            </li>
          </ul>

          <h2 id="security">安全设计</h2>
          <p>
            账号密码在任何接口都不以明文出现。登录、注册与修改密码使用混合加密：
          </p>
          <ol className="my-3 list-decimal space-y-1.5 pl-5 text-[15px] leading-7 text-slate-600">
            <li>客户端调用 <code>GET /api/auth/handshake</code> 获取 RSA 公钥与一次性 nonce；</li>
            <li>生成随机 AES-256-GCM 会话密钥，用 RSA-OAEP(SHA-256) 包裹该密钥；</li>
            <li>业务数据（含 nonce 与时间戳）用 AES-GCM 加密后提交；</li>
            <li>服务端解密并校验：密钥指纹一致、时间窗 ±5 分钟、nonce 一次性未过期。</li>
          </ol>
          <p className="flex items-start gap-2 rounded-xl bg-emerald-50/70 px-4 py-3 text-[13.5px] text-emerald-800">
            <ShieldCheck size={16} className="mt-1 shrink-0" />
            密码本身以 PBKDF2-SHA256（260,000 次迭代 + 随机盐）落库；JWT 使用 HS256 签名，
            默认有效期 72 小时，可通过环境变量调整。
          </p>

          <h2 id="api">接口概览</h2>
          <p>
            启动后访问 <code>/api/docs</code> 查看 Swagger UI。主要分组：
          </p>
          <table>
            <thead>
              <tr>
                <th>前缀</th>
                <th>用途</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>/api/auth</code>
                </td>
                <td>握手、加密登录、加密注册、个人资料、加密改密</td>
              </tr>
              <tr>
                <td>
                  <code>/api/categories</code>
                </td>
                <td>品类增删改查（有流水时自动归档，可恢复）</td>
              </tr>
              <tr>
                <td>
                  <code>/api/transactions</code>
                </td>
                <td>流水分页、搜索、增删改（写操作触发重算）</td>
              </tr>
              <tr>
                <td>
                  <code>/api/stats</code>
                </td>
                <td>看板、趋势、分类构成、报表、切片浏览</td>
              </tr>
              <tr>
                <td>
                  <code>/api/budgets</code>
                </td>
                <td>总预算 / 子预算 / 独立预算</td>
              </tr>
              <tr>
                <td>
                  <code>/api/jobs</code>
                </td>
                <td>任务列表、统计、触发日切片与全量重建</td>
              </tr>
              <tr>
                <td>
                  <code>/api/system</code>
                </td>
                <td>运行信息、示例数据、清空数据</td>
              </tr>
            </tbody>
          </table>

          <h2 id="faq">常见问题</h2>
          <h3>为什么刚记完账，报表数字有延迟？</h3>
          <p>
            报表读的是切片，切片由后台任务重算，通常几百毫秒内完成。预算与看板金额直接读流水，不受影响。
            具体进度可在任务中心查看。
          </p>
          <h3>删除品类后历史流水会丢吗？</h3>
          <p>
            不会。品类下有流水时会自动归档，历史记录与统计保持完整，可随时在品类管理里恢复；
            若一级品类下还有子品类，需要先删除或归档子品类，避免误删整组。
          </p>
          <h3>可以只用浏览器访问吗？需要 HTTPS 吗？</h3>
          <p>
            可以。WebCrypto 在 <code>localhost</code> 与 HTTPS 下都可用；如果用局域网 IP 明文 HTTP 访问，
            浏览器会禁用 WebCrypto，登录会被拦截并提示改用 localhost 或 HTTPS。
          </p>
        </article>
      </div>
    </div>
  );
}
