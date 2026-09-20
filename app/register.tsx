import { fetchApi, openPhoto } from "../web/api";
("use client");
import { useEffect, useState, useRef, useCallback, useContext } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Camera,
  ClipboardCheck,
  ChartNoAxesCombined,
  Users,
  Clock3,
  Download,
  Check,
} from "lucide-react";
import { UserContext } from "../web/context";
import Accounts from "../web/accounts";
import RecordManagement from "../web/records";
type Student = {
  id: string;
  grade: string;
  class_name: string;
  name: string;
  number: string;
};
const grades = ["初一", "初二", "初三", "高一", "高二", "高三"];
const today = () => new Date(Date.now() + 28800000).toISOString().slice(0, 10);
const beijing = (d: string) =>
  new Date(d).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
async function api(url: string, options?: RequestInit) {
  const r = await fetchApi(url, options);
  const d: any = await r.json();
  if (!r.ok) throw new Error(d.error || "操作失败，请重试");
  return d;
}
function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const csv = (v: unknown) =>
  '"' +
  String(v)
    .replace(/^[=+@-]/, "'$&")
    .replaceAll('"', '""') +
  '"';
export default function Home() {
  const [studentSearch, setStudentSearch] = useState("");
  const user = useContext(UserContext);
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState("register"),
    [now, setNow] = useState(""),
    [students, setStudents] = useState<Student[]>([]),
    [grade, setGrade] = useState(""),
    [cls, setCls] = useState(""),
    [studentId, setStudentId] = useState("");
  const [photo, setPhoto] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [details, setDetails] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [kind, setKind] = useState("week"),
    [date, setDate] = useState(""),
    [report, setReport] = useState<any>(null),
    [reportBusy, setReportBusy] = useState(false),
    [importText, setImportText] = useState("");
  const requestId = useRef("");
  const camera = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStudents(await api("/api/students"));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    setDate(today());
    const tick = () => setNow(beijing(new Date().toISOString()));
    tick();
    const t = setInterval(tick, 1000);
    void refresh();
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    if (!photo) {
      setPreview("");
      return;
    }
    const u = URL.createObjectURL(photo);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);
  useEffect(() => {
    if (tab !== "reports" || !date) return;
    const controller = new AbortController();
    setReportBusy(true);
    setReport(null);
    api("/api/report?kind=" + kind + "&date=" + date, {
      signal: controller.signal,
    })
      .then(setReport)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setReportBusy(false);
      });
    return () => controller.abort();
  }, [tab, kind, date]);
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const life = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: "read_class_report",
            title: "读取班级周月报",
            description:
              "按北京时间日期读取班级次数和年段最高班级，并显示报告。",
            inputSchema: {
              type: "object",
              properties: {
                kind: { type: "string", enum: ["week", "month"] },
                date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
              },
              required: ["kind", "date"],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            async execute(input: any) {
              if (
                !input ||
                !["week", "month"].includes(input.kind) ||
                !/^\d{4}-\d{2}-\d{2}$/.test(input.date)
              )
                throw new Error("统计参数无效");
              const data = await api(
                "/api/report?kind=" + input.kind + "&date=" + input.date,
              );
              setKind(input.kind);
              setDate(input.date);
              setTab("reports");
              setReport(data);
              return {
                from: data.from,
                to: data.to,
                total: data.total,
                rows: data.rows,
                leaders: data.leaders,
              };
            },
          },
          { signal: life.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => life.abort();
  }, []);
  const classes = [
    ...new Set(
      students.filter((s) => s.grade === grade).map((s) => s.class_name),
    ),
  ].sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));
  const choices = students
    .filter((s) => s.grade === grade && s.class_name === cls)
    .sort((a, b) =>
      a.number.localeCompare(b.number, "zh-CN", { numeric: true }),
    );
  const selected = students.find((s) => s.id === studentId);
  async function choosePhoto(f?: File) {
    if (!f) return;
    setError("");
    try {
      if (!f.type.startsWith("image/") || f.size > 25 * 1024 * 1024)
        throw new Error("请选择 25MB 以内的照片");
      const bitmap = await createImageBitmap(f);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob(r, "image/jpeg", 0.86),
      );
      if (!blob) throw new Error("照片读取失败，请重新拍摄");
      setPhoto(new File([blob], "现场照片.jpg", { type: "image/jpeg" }));
      requestId.current = "";
    } catch (e: any) {
      setError(e.message || "无法读取照片，请使用 JPG 照片");
    }
  }
  async function save() {
    if (!selected || !photo || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      requestId.current ||= crypto.randomUUID();
      const body = new FormData();
      body.set("id", requestId.current);
      body.set("studentId", studentId);
      body.set("details", details.trim());
      body.set("photo", photo);
      const result = await api("/api/incidents", { method: "POST", body });
      setMessage(
        `已登记：${selected.grade}${selected.class_name} ${selected.name}\n${beijing(result.created_at)}`,
      );
      setPhoto(null);
      setDetails("");
      setStudentId("");
      requestId.current = "";
      if (camera.current) camera.current.value = "";
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function importRoster(sample = false) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const lines = importText
        .trim()
        .split(/\r?\n/)
        .filter((x) => x.trim());
      const rows = lines.map((line, i) => {
        const cells = line.split(/\t|,/).map((x) => x.trim());
        if (cells.length !== 4)
          throw new Error(`第 ${i + 1} 行应有四列：年段、班级、序号、姓名`);
        const [grade, class_name, number, name] = cells;
        return { grade, class_name, number, name };
      });
      const result = await api("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sample ? { sample: true } : { rows }),
      });
      await refresh();
      setImportText("");
      setMessage(
        `已导入 ${result.added} 人，跳过已有名单 ${result.skipped} 人。`,
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function exportReport() {
    if (!report) return;
    const rows = [
      ["统计类型", kind === "week" ? "周报" : "月报"],
      ["起始日期", report.from],
      ["截止日期", report.to],
      ["统计口径", "每次登记计1次"],
      [],
      ["年段", "班级", "违规次数"],
      ...report.rows.map((r: any) => [r.grade, r.class_name, r.count]),
      [],
      ["年段", "最多次数", "最多班级（含并列）"],
      ...report.leaders.map((r: any) => [
        r.grade,
        r.max,
        r.classes.join("、") || "本期无违规登记",
      ]),
    ];
    download(
      `违规${kind === "week" ? "周报" : "月报"}_${report.from}.csv`,
      rows.map((r) => r.map(csv).join(",")).join("\r\n"),
    );
  }
  return (
    <main>
      <header>
        <span className="brand">
          <ClipboardCheck size={22} />
        </span>
        <div>
          <strong>校园记录</strong>
          <p>学生违规登记</p>
        </div>
        <span className="private">校内工作台</span>
      </header>
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v);
          setError("");
          setMessage("");
        }}
      >
        <TabsList className="nav">
          <TabsTrigger value="register">
            <ClipboardCheck size={18} />
            登记
          </TabsTrigger>
          <TabsTrigger value="reports">
            <ChartNoAxesCombined size={18} />
            统计报告
          </TabsTrigger>
          <TabsTrigger value="roster">
            <Users size={18} />
            学生名册
          </TabsTrigger>
          {isAdmin && <TabsTrigger value="accounts">管理</TabsTrigger>}
        </TabsList>
        {error && (
          <div className="notice error" role="alert">
            {error}
            <Button
              variant="ghost"
              onClick={() => {
                setError("");
                void refresh();
              }}
            >
              重试加载名册
            </Button>
          </div>
        )}
        {message && (
          <div className="notice" role="status">
            {message}
          </div>
        )}
        <TabsContent value="register">
          <section className="title">
            <span>现场登记</span>
            <h1>学生违规登记</h1>
            <p className="muted">选择学生，拍摄照片，完成登记。</p>
          </section>
          <section className="card">
            <div className="clock">
              <Clock3 size={20} />
              <div>
                <small>北京时间 · 保存时自动记录</small>
                <strong>{now || "正在获取时间"}</strong>
              </div>
            </div>
            {!loading && !students.length && (
              <div className="notice">
                先在“学生名册”导入名单，即可开始登记。
                <Button variant="ghost" onClick={() => setTab("roster")}>
                  导入名册
                </Button>
              </div>
            )}
            <div className="fields">
              <label>
                年段
                <NativeSelect
                  aria-label="年段"
                  value={grade}
                  disabled={busy}
                  onChange={(e) => {
                    setGrade(e.target.value);
                    setCls("");
                    setStudentSearch("");
                    setStudentId("");
                    requestId.current = "";
                  }}
                >
                  <option value="">请选择年段</option>
                  {grades
                    .filter((g) => students.some((s) => s.grade === g))
                    .map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                </NativeSelect>
              </label>
              <label>
                班级
                <NativeSelect
                  aria-label="班级"
                  value={cls}
                  disabled={!grade || busy}
                  onChange={(e) => {
                    setCls(e.target.value);
                    setStudentSearch("");
                    setStudentId("");
                    requestId.current = "";
                  }}
                >
                  <option value="">请选择班级</option>
                  {classes.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </NativeSelect>
              </label>
            </div>
            <label>
              姓名
              <Input
                aria-label="姓名搜索"
                placeholder="输入姓名，支持部分匹配"
                value={studentSearch}
                disabled={!cls || busy}
                onChange={(e) => {
                  setStudentSearch(e.target.value);
                  setStudentId("");
                  requestId.current = "";
                }}
              />
            </label>
            {selected ? (
              <p className="notice">
                已选择：{selected.name}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setStudentId("");
                    setStudentSearch("");
                  }}
                >
                  重新选择
                </Button>
              </p>
            ) : cls && studentSearch.trim() ? (
              <div role="list" aria-label="匹配学生">
                {choices
                  .filter((s) => s.name.includes(studentSearch.trim()))
                  .map((s) => (
                    <Button
                      role="listitem"
                      key={s.id}
                      disabled={
                        choices.filter((x) => x.name === s.name).length > 1 &&
                        !isAdmin
                      }
                      variant="outline"
                      style={{
                        display: "flex",
                        width: "100%",
                        margin: "6px 0",
                        justifyContent: "space-between",
                      }}
                      onClick={() => {
                        setStudentId(s.id);
                        setStudentSearch("");
                        requestId.current = "";
                      }}
                    >
                      {s.name}
                      {choices.filter((x) => x.name === s.name).length > 1 && (
                        <small>
                          {isAdmin
                            ? "同名 · 后台序号 " + s.number
                            : "同名 · 请向管理员核对"}
                        </small>
                      )}
                    </Button>
                  ))}
                {!choices.some((s) =>
                  s.name.includes(studentSearch.trim()),
                ) && <p className="muted">没有匹配学生，请检查姓名或班级。</p>}
              </div>
            ) : (
              <p className="muted">
                {loading
                  ? "正在加载名册"
                  : cls
                    ? "输入姓名中的一个或几个字，再点击学生确认。"
                    : "请先选择年段和班级。"}
              </p>
            )}
            <label>
              违规情况
              <Textarea
                aria-label="违规情况"
                maxLength={500}
                rows={3}
                placeholder="例如：课间在走廊追逐，经提醒后停止"
                value={details}
                disabled={busy}
                onChange={(e) => {
                  setDetails(e.target.value);
                  requestId.current = "";
                }}
              />
            </label>
            <p className="muted" style={{ textAlign: "right" }}>
              {details.length}/500 字
            </p>
            <label>
              现场照片 <span className="required">必填</span>
              <div className="capture">
                {preview ? (
                  <>
                    <img src={preview} alt="待保存的现场照片" />
                    <small>点击重新拍摄</small>
                  </>
                ) : (
                  <>
                    <Camera size={32} />
                    <b>拍摄现场人像照片</b>
                    <small>点击调用手机相机</small>
                  </>
                )}
                <input
                  ref={camera}
                  aria-label="拍摄现场人像照片"
                  disabled={busy}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => void choosePhoto(e.target.files?.[0])}
                />
              </div>
            </label>
            <Button
              className="submit"
              disabled={!studentId || !photo || busy}
              onClick={save}
            >
              <Check size={18} />
              {busy ? "正在保存…" : "保存登记"}
            </Button>
          </section>
        </TabsContent>
        <TabsContent value="reports">
          <section className="title">
            <span>班级统计</span>
            <h1>周报与月报</h1>
          </section>
          <section className="card">
            <div className="fields report-controls">
              <label>
                报告类型
                <NativeSelect
                  aria-label="报告类型"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="week">每周报告</option>
                  <option value="month">每月报告</option>
                </NativeSelect>
              </label>
              <label>
                选择日期
                <Input
                  aria-label="选择日期"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            </div>
            {reportBusy ? (
              <p className="empty">正在统计…</p>
            ) : report ? (
              <>
                <p className="period">
                  {report.from} 至 {report.to} · 北京时间
                </p>
                <div className="metric">
                  <p className="muted">本期违规登记</p>
                  <span className="big">{report.total}</span>{" "}
                  <span className="muted">次</span>
                </div>
                <h2>各班违规次数</h2>
                {!report.rows.length ? (
                  <p className="empty">暂无班级，请先导入名册。</p>
                ) : (
                  report.rows.map((r: any) => (
                    <div
                      key={r.grade + r.class_name}
                      style={{ padding: "12px 0" }}
                    >
                      <div className="row" style={{ padding: 0, border: 0 }}>
                        <span>
                          {r.grade}
                          {r.class_name}
                        </span>
                        <b>{r.count} 次</b>
                      </div>
                      <div className="bar">
                        <i
                          style={{
                            width:
                              Math.max(
                                0,
                                (Number(r.count) /
                                  Math.max(
                                    1,
                                    ...report.rows.map((x: any) =>
                                      Number(x.count),
                                    ),
                                  )) *
                                  100,
                              ) + "%",
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
                <h2 style={{ marginTop: 28 }}>各年段最多班级</h2>
                {report.leaders.map((r: any) => (
                  <div className="row" key={r.grade}>
                    <span>{r.grade}</span>
                    <span>
                      {r.max > 0 ? (
                        <>
                          {r.classes.join("、")} · {r.max} 次
                          {r.classes.length > 1 ? "（并列）" : ""}
                        </>
                      ) : (
                        <small>本期无违规登记</small>
                      )}
                    </span>
                  </div>
                ))}
                <div className="actions" style={{ marginTop: 24 }}>
                  <Button onClick={exportReport}>
                    <Download size={16} />
                    导出 Excel 可用 CSV
                  </Button>
                  <Button variant="outline" onClick={() => window.print()}>
                    打印 / 存为 PDF
                  </Button>
                </div>
                <p className="muted" style={{ marginTop: 16 }}>
                  自然周为周一至周日，月报为自然月。报告自动汇总所选期间，每次登记计
                  1 次，同一学生多次登记分别计数。
                </p>
              </>
            ) : (
              <p className="empty">请选择有效日期以生成报告。</p>
            )}
          </section>
          {report?.recent?.length > 0 && (
            <section className="card">
              <h2>本期登记明细</h2>
              {isAdmin && (
                <Button variant="outline" onClick={() => setTab("accounts")}>
                  修改 / 删除记录
                </Button>
              )}
              <p className="muted">显示最近 100 条，统计包含全部记录。</p>
              {report.recent.map((r: any) => (
                <div className="row" key={r.id}>
                  <div>
                    <b>{r.name}</b>
                    <p className="muted">
                      {r.grade}
                      {r.class_name}
                      {isAdmin && <> · 序号 {r.number}</>}
                      <br />
                      {beijing(r.created_at)}
                      {r.details && (
                        <>
                          <br />
                          违规情况：{r.details}
                        </>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      openPhoto(r.id).catch((e: any) => setError(e.message))
                    }
                  >
                    查看照片
                  </Button>
                </div>
              ))}
            </section>
          )}
        </TabsContent>
        <TabsContent value="accounts">
          {isAdmin && (
            <>
              <RecordManagement students={students} />
              <Accounts />
            </>
          )}
        </TabsContent>
        <TabsContent value="roster">
          <section className="title">
            <span>登记底表</span>
            <h1>学生名册</h1>
            <p className="muted">
              已录入 {students.length} 名学生 ·{" "}
              {new Set(students.map((s) => s.grade + s.class_name)).size} 个班级
            </p>
          </section>
          {isAdmin && (
            <>
              <section className="card">
                <h2>批量添加学生</h2>
                <label>
                  从 Excel 复制四列（不含表头）
                  <Textarea
                    aria-label="批量学生名单"
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={"初一\t三班\t1\t张同学\n高三\t七班\t2\t李同学"}
                  />
                </label>
                <p className="muted">
                  每行顺序：年段、班级、序号、姓名。列之间使用制表符或英文逗号。相同名单可重复导入，已有学生会自动跳过。
                </p>
                <Button
                  disabled={busy || !importText.trim()}
                  style={{ marginTop: 16 }}
                  onClick={() => void importRoster(false)}
                >
                  导入名单
                </Button>
              </section>
            </>
          )}
          <section className="card">
            <h2>按班级查看</h2>
            <div className="fields">
              <label>
                年段
                <NativeSelect
                  aria-label="查看年段"
                  value={grade}
                  onChange={(e) => {
                    setGrade(e.target.value);
                    setCls("");
                    setStudentId("");
                  }}
                >
                  <option value="">请选择年段</option>
                  {grades
                    .filter((g) => students.some((s) => s.grade === g))
                    .map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                </NativeSelect>
              </label>
              <label>
                班级
                <NativeSelect
                  aria-label="查看班级"
                  value={cls}
                  onChange={(e) => {
                    setCls(e.target.value);
                    setStudentId("");
                  }}
                >
                  <option value="">请选择班级</option>
                  {classes.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </NativeSelect>
              </label>
            </div>
            {choices.length ? (
              choices.map((s) => (
                <div className="row" key={s.id}>
                  <span>{s.name}</span>
                  {isAdmin && <small>序号 {s.number}</small>}
                </div>
              ))
            ) : (
              <p className="empty">选择班级查看名单</p>
            )}
          </section>
        </TabsContent>
      </Tabs>
      <footer>以登记次数统计 · 每次登记计 1 次</footer>
    </main>
  );
}
