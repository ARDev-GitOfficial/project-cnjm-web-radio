import { useMemo, useState } from "react";
import { CalendarDays, Download, FileImage, FileText, TrendingUp, UsersRound } from "lucide-react";
import {
  normalizeLiveStatusTest,
  resolveLiveStatusTestMetrics,
  type LiveStatusTestPayload,
} from "../lib/liveDjs";
import type { LiveDjStatus } from "../types";

type ReportPeriod = "day" | "week" | "month";

type ReportPoint = {
  label: string;
  date: Date;
  online: number;
  visits: number;
};

type AudienceReport = {
  period: ReportPeriod;
  periodLabel: string;
  generatedAt: Date;
  points: ReportPoint[];
  peakOnline: number;
  averageOnline: number;
  visitIncrease: number;
  visits: number;
  onlineChange: number;
  distribution: Array<{ label: string; value: number; color: string }>;
  growthPoints: ReportPoint[];
};

type AudienceReportPanelProps = {
  liveTest: LiveStatusTestPayload;
  liveDj: LiveDjStatus | null;
  source: "blobs" | "local" | "fallback";
};

const PERIODS: Array<{ id: ReportPeriod; label: string }> = [
  { id: "day", label: "Dia" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mês" },
];

const REPORT_COLORS = ["#30dc82", "#b5dc37", "#f4c84c", "#5aa82a"];

const numberFormatter = new Intl.NumberFormat("pt-BR");
const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const timestampFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function AudienceReportPanel({ liveTest, liveDj, source }: AudienceReportPanelProps) {
  const [period, setPeriod] = useState<ReportPeriod>("day");
  const [isExporting, setIsExporting] = useState<"image" | "pdf" | null>(null);
  const report = useMemo(() => createAudienceReport(liveTest, liveDj, period), [liveDj, liveTest, period]);
  const chart = useMemo(() => chartModel(report.points), [report.points]);

  const exportReport = async (format: "image" | "pdf") => {
    setIsExporting(format);
    try {
      const canvas = await renderReportCanvas(report);
      const fileBase = `relatorio-audiencia-${period}-${toFileDate(report.generatedAt)}`;

      if (format === "image") {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("Não foi possível gerar a imagem.");
        downloadBlob(blob, `${fileBase}.png`);
        return;
      }

      const { jsPDF } = await import("jspdf");
      const document = new jsPDF({ orientation: "portrait", unit: "px", format: [800, 1125] });
      document.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 800, 1125, undefined, "FAST");
      document.save(`${fileBase}.pdf`);
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <section className="audience-report-page" aria-labelledby="audience-report-title">
      <header className="audience-report-head">
        <div className="audience-report-brand">
          <img src="/assets/cnjmradio-launcher-art.webp" alt="Web Rádio Conexão Jamaica" />
          <div>
            <span><TrendingUp size={15} /> Indicadores estimados</span>
            <h2 id="audience-report-title">Relatório de audiência</h2>
            <p>Resumo visual de pessoas online e visitas estimadas, baseado na configuração ativa do site.</p>
          </div>
        </div>
        <div className="audience-report-actions">
          <div className="audience-report-periods" role="group" aria-label="Período do relatório">
            {PERIODS.map((item) => (
              <button key={item.id} type="button" className={period === item.id ? "is-active" : ""} onClick={() => setPeriod(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <button className="ghost-button" type="button" onClick={() => void exportReport("image")} disabled={isExporting !== null}>
            <FileImage size={16} /> {isExporting === "image" ? "Gerando imagem" : "Exportar imagem"}
          </button>
          <button className="play-main slim" type="button" onClick={() => void exportReport("pdf")} disabled={isExporting !== null}>
            <FileText size={16} /> {isExporting === "pdf" ? "Gerando PDF" : "Exportar PDF"}
          </button>
        </div>
      </header>

      <div className="audience-report-meta">
        <span><CalendarDays size={14} /> {report.periodLabel}</span>
        <span><UsersRound size={14} /> {source === "blobs" ? "Configuração global" : "Prévia local"}</span>
        <span>Gerado em {timestampFormatter.format(report.generatedAt)}</span>
      </div>

      <section className="audience-report-kpis" aria-label="Resumo de audiência">
        <ReportMetric label="Pico de pessoas online" value={formatNumber(report.peakOnline)} detail="maior referência do período" tone="green" />
        <ReportMetric label="Média de pessoas online" value={formatNumber(report.averageOnline)} detail="média estimada do período" tone="lime" />
        <ReportMetric label="Visitas estimadas" value={formatNumber(report.visits)} detail={`+${formatNumber(report.visitIncrease)} no período`} tone="gold" />
        <ReportMetric label="Variação de audiência" value={`${report.onlineChange >= 0 ? "+" : ""}${formatNumber(report.onlineChange)}`} detail="entre o início e o fim" tone="green" />
      </section>

      <section className="audience-report-chart-panel">
        <div className="audience-report-section-head">
          <div>
            <span><TrendingUp size={17} /> Evolução da audiência</span>
            <h3>Pessoas online por {period === "day" ? "hora" : period === "week" ? "dia" : "dia do mês"}</h3>
          </div>
          <strong>{formatNumber(report.peakOnline)}</strong>
        </div>
        <AudienceChart chart={chart} points={report.points} />
      </section>

      <section className="audience-report-bottom-grid">
        <article className="audience-report-distribution">
          <div className="audience-report-section-head compact">
            <div>
              <span><UsersRound size={17} /> Distribuição da audiência</span>
              <h3>Participação por fase do período</h3>
            </div>
          </div>
          <div className="audience-report-distribution-content">
            <div className="audience-report-donut" style={{ background: donutGradient(report.distribution) }} aria-label="Distribuição estimada da audiência">
              <span>100%<small>do período</small></span>
            </div>
            <ul>
              {report.distribution.map((item) => (
                <li key={item.label}>
                  <i style={{ background: item.color }} />
                  <span>{item.label}</span>
                  <strong>{item.value}%</strong>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article className="audience-report-highlights">
          <div className="audience-report-section-head compact">
            <div>
              <span><TrendingUp size={17} /> Principais pontos</span>
              <h3>Momentos de maior audiência</h3>
            </div>
          </div>
          <ol>
            {report.growthPoints.map((point, index) => (
              <li key={`${point.label}-${index}`}>
                <time>{point.label}</time>
                <span>{highlightLabel(index, report.period)}</span>
                <strong>{formatNumber(point.online)}</strong>
              </li>
            ))}
          </ol>
        </article>
      </section>

      <section className="audience-report-timeline" aria-label="Linha do tempo da audiência">
        <div className="audience-report-section-head compact">
          <div>
            <span><TrendingUp size={17} /> Linha do tempo</span>
            <h3>Leitura rápida do período</h3>
          </div>
          <Download size={18} aria-hidden="true" />
        </div>
        <div className="audience-report-timeline-points">
          {timelinePoints(report.points).map((point, index) => (
            <div key={`${point.label}-${index}`}>
              <span>{point.label}</span>
              <strong>{formatNumber(point.online)}</strong>
              <small>{timelineLabel(index, report.period)}</small>
            </div>
          ))}
        </div>
        <p>Indicadores estimados de audiência e visitas. O relatório foi gerado localmente e não cria registros extras no serviço.</p>
      </section>
    </section>
  );
}

function ReportMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "green" | "lime" | "gold" }) {
  return (
    <article className={`audience-report-kpi is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function AudienceChart({ chart, points }: { chart: ReturnType<typeof chartModel>; points: ReportPoint[] }) {
  const labels = sparseLabels(points);
  return (
    <div className="audience-report-chart" role="img" aria-label="Gráfico de evolução estimada de pessoas online">
      <span className="audience-report-axis-top">{formatNumber(chart.max)}</span>
      <span className="audience-report-axis-middle">{formatNumber(Math.round((chart.max + chart.min) / 2))}</span>
      <span className="audience-report-axis-bottom">{formatNumber(chart.min)}</span>
      <svg viewBox="0 0 1000 360" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="audience-report-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2fe88a" />
            <stop offset="100%" stopColor="#f3cb4f" />
          </linearGradient>
          <linearGradient id="audience-report-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2fe88a" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#2fe88a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((line) => <path key={line} d={`M0 ${line * 90} H1000`} className="audience-report-grid-line" />)}
        <path d={`${chart.path} L1000 360 L0 360 Z`} fill="url(#audience-report-fill)" />
        <path d={chart.path} className="audience-report-line" />
        {chart.coordinates.map((coordinate, index) => (
          <circle key={index} cx={coordinate.x} cy={coordinate.y} r={index === chart.coordinates.length - 1 ? 7 : 4.4} className="audience-report-point" />
        ))}
      </svg>
      <div className="audience-report-axis-labels">
        {labels.map((item) => <span key={`${item.index}-${item.label}`} style={{ left: `${item.position}%` }}>{item.label}</span>)}
      </div>
    </div>
  );
}

function createAudienceReport(liveTest: LiveStatusTestPayload, liveDj: LiveDjStatus | null, period: ReportPeriod): AudienceReport {
  const normalized = normalizeLiveStatusTest(liveTest);
  const generatedAt = new Date();
  const pointCount = period === "day" ? 24 : period === "week" ? 7 : 30;
  const stepMs = period === "day" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const startMs = generatedAt.getTime() - (pointCount - 1) * stepMs;
  const points = Array.from({ length: pointCount }, (_, index) => {
    const date = new Date(startMs + index * stepMs);
    const metrics = resolveLiveStatusTestMetrics(normalized, date.getTime(), { liveDj });
    return {
      date,
      label: labelForPoint(date, period),
      online: metrics.listeners,
      visits: metrics.visitors,
    };
  });
  const totalOnline = points.reduce((total, point) => total + point.online, 0);
  const totalPeriodOnline = Math.max(1, totalOnline);
  const distribution = splitIntoFour(points).map((group, index) => ({
    label: distributionLabel(index, period),
    value: Math.round(group.reduce((total, point) => total + point.online, 0) / totalPeriodOnline * 100),
    color: REPORT_COLORS[index],
  }));
  const sortedByOnline = [...points].sort((first, second) => second.online - first.online);

  return {
    period,
    periodLabel: periodLabel(period, points[0]?.date ?? generatedAt, generatedAt),
    generatedAt,
    points,
    peakOnline: Math.max(...points.map((point) => point.online)),
    averageOnline: Math.round(totalOnline / points.length),
    visitIncrease: Math.max(0, points[points.length - 1]!.visits - points[0]!.visits),
    visits: points[points.length - 1]!.visits,
    onlineChange: points[points.length - 1]!.online - points[0]!.online,
    distribution,
    growthPoints: sortedByOnline.slice(0, Math.min(5, sortedByOnline.length)).sort((first, second) => first.date.getTime() - second.date.getTime()),
  };
}

function chartModel(points: ReportPoint[]) {
  const values = points.map((point) => point.online);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max(1, Math.round((rawMax - rawMin || rawMax || 1) * 0.16));
  const min = Math.max(0, rawMin - padding);
  const max = Math.max(min + 2, rawMax + padding);
  const range = max - min;
  const coordinates = points.map((point, index) => ({
    x: points.length === 1 ? 500 : index / (points.length - 1) * 1000,
    y: 338 - (point.online - min) / range * 300,
  }));
  return {
    min,
    max,
    coordinates,
    path: coordinates.map((coordinate, index) => `${index === 0 ? "M" : "L"}${coordinate.x.toFixed(2)} ${coordinate.y.toFixed(2)}`).join(" "),
  };
}

async function renderReportCanvas(report: AudienceReport) {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 2250;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponível.");

  const [background, art] = await Promise.all([
    loadImage("/assets/bg-cnjm-landscape-v2.webp"),
    loadImage("/assets/cnjmradio-launcher-art.webp"),
  ]);
  drawReport(context, canvas.width, canvas.height, report, background, art);
  return canvas;
}

function drawReport(context: CanvasRenderingContext2D, width: number, height: number, report: AudienceReport, background: HTMLImageElement | null, art: HTMLImageElement | null) {
  context.fillStyle = "#041008";
  context.fillRect(0, 0, width, height);
  if (background) {
    context.save();
    context.globalAlpha = 0.24;
    coverImage(context, background, 0, 0, width, height);
    context.restore();
  }
  const topGradient = context.createLinearGradient(0, 0, 0, 460);
  topGradient.addColorStop(0, "rgba(2, 10, 5, 0.14)");
  topGradient.addColorStop(1, "rgba(2, 10, 5, 0.88)");
  context.fillStyle = topGradient;
  context.fillRect(0, 0, width, 480);

  context.strokeStyle = "rgba(243, 203, 79, 0.44)";
  context.lineWidth = 2;
  roundedRect(context, 50, 44, 1500, 330, 22);
  context.stroke();
  if (art) context.drawImage(art, 76, 88, 265, 265);
  context.fillStyle = "#f8f3d8";
  context.font = "800 38px Arial";
  context.fillText("WEB RÁDIO", 365, 120);
  context.font = "900 80px Arial";
  context.fillStyle = "#f0d35b";
  context.fillText("CONEXÃO", 365, 203);
  context.fillStyle = "#62df8d";
  context.fillText("JAMAICA", 365, 282);
  context.font = "800 27px Arial";
  context.fillStyle = "#f8f3d8";
  context.fillText("REGGAE EM TODAS AS VERTENTES", 367, 326);
  context.textAlign = "right";
  context.font = "700 30px Arial";
  context.fillStyle = "#61e293";
  context.fillText("RELATÓRIO DE AUDIÊNCIA", 1510, 120);
  context.font = "700 25px Arial";
  context.fillStyle = "#ede9d3";
  context.fillText(report.periodLabel.toUpperCase(), 1510, 164);
  context.fillStyle = "rgba(237, 233, 211, 0.74)";
  context.fillText(`Gerado em ${timestampFormatter.format(report.generatedAt)}`, 1510, 205);
  context.textAlign = "left";

  const metrics = [
    ["PICO DE PESSOAS ONLINE", formatNumber(report.peakOnline), "maior referência do período", "#2fe88a"],
    ["MÉDIA DE PESSOAS ONLINE", formatNumber(report.averageOnline), "média estimada do período", "#a7df38"],
    ["VISITAS ESTIMADAS", formatNumber(report.visits), `+${formatNumber(report.visitIncrease)} no período`, "#f3cb4f"],
    ["VARIAÇÃO DE AUDIÊNCIA", `${report.onlineChange >= 0 ? "+" : ""}${formatNumber(report.onlineChange)}`, "entre início e fim", "#5de19a"],
  ];
  const metricY = 418;
  const metricWidth = 354;
  metrics.forEach(([label, value, detail, color], index) => {
    const x = 50 + index * 380;
    drawPanel(context, x, metricY, metricWidth, 214);
    context.fillStyle = color;
    context.font = "800 20px Arial";
    context.fillText(label, x + 24, metricY + 45);
    context.font = "900 54px Arial";
    context.fillStyle = "#ecf6dc";
    context.fillText(value, x + 24, metricY + 122);
    context.font = "700 22px Arial";
    context.fillStyle = "rgba(235, 243, 223, 0.72)";
    context.fillText(detail, x + 24, metricY + 166);
  });

  const chartY = 666;
  drawPanel(context, 50, chartY, 1500, 720);
  context.fillStyle = "#5fe69b";
  context.font = "800 28px Arial";
  context.fillText("EVOLUÇÃO DA AUDIÊNCIA", 82, chartY + 58);
  context.fillStyle = "rgba(235, 243, 223, 0.74)";
  context.font = "700 22px Arial";
  context.fillText("Pessoas online no período", 82, chartY + 91);
  const chartX = 136;
  const chartTop = chartY + 150;
  const chartWidth = 1328;
  const chartHeight = 470;
  const chart = chartModel(report.points);
  context.strokeStyle = "rgba(235, 243, 223, 0.16)";
  context.lineWidth = 1;
  for (let line = 0; line <= 4; line += 1) {
    const y = chartTop + chartHeight * line / 4;
    context.beginPath();
    context.moveTo(chartX, y);
    context.lineTo(chartX + chartWidth, y);
    context.stroke();
    context.font = "700 20px Arial";
    context.fillStyle = "rgba(235, 243, 223, 0.7)";
    context.fillText(formatNumber(Math.round(chart.max - (chart.max - chart.min) * line / 4)), 66, y + 7);
  }
  const coordinates = report.points.map((point, index) => ({
    x: chartX + index / Math.max(1, report.points.length - 1) * chartWidth,
    y: chartTop + chartHeight - (point.online - chart.min) / Math.max(1, chart.max - chart.min) * chartHeight,
  }));
  const chartFill = context.createLinearGradient(0, chartTop, 0, chartTop + chartHeight);
  chartFill.addColorStop(0, "rgba(47, 232, 138, 0.37)");
  chartFill.addColorStop(1, "rgba(47, 232, 138, 0.01)");
  context.beginPath();
  coordinates.forEach((coordinate, index) => index === 0 ? context.moveTo(coordinate.x, coordinate.y) : context.lineTo(coordinate.x, coordinate.y));
  context.lineTo(chartX + chartWidth, chartTop + chartHeight);
  context.lineTo(chartX, chartTop + chartHeight);
  context.closePath();
  context.fillStyle = chartFill;
  context.fill();
  const lineGradient = context.createLinearGradient(chartX, 0, chartX + chartWidth, 0);
  lineGradient.addColorStop(0, "#2fe88a");
  lineGradient.addColorStop(1, "#f3cb4f");
  context.beginPath();
  coordinates.forEach((coordinate, index) => index === 0 ? context.moveTo(coordinate.x, coordinate.y) : context.lineTo(coordinate.x, coordinate.y));
  context.strokeStyle = lineGradient;
  context.lineWidth = 5;
  context.stroke();
  coordinates.forEach((coordinate) => {
    context.beginPath();
    context.arc(coordinate.x, coordinate.y, 6, 0, Math.PI * 2);
    context.fillStyle = "#edf7dd";
    context.fill();
  });
  sparseLabels(report.points).forEach(({ label, position }) => {
    context.textAlign = "center";
    context.font = "700 19px Arial";
    context.fillStyle = "rgba(235, 243, 223, 0.72)";
    context.fillText(label, chartX + chartWidth * position / 100, chartTop + chartHeight + 44);
  });
  context.textAlign = "left";

  const lowerY = 1420;
  drawPanel(context, 50, lowerY, 722, 464);
  drawPanel(context, 798, lowerY, 752, 464);
  context.fillStyle = "#5fe69b";
  context.font = "800 26px Arial";
  context.fillText("DISTRIBUIÇÃO DA AUDIÊNCIA", 80, lowerY + 52);
  context.font = "700 20px Arial";
  context.fillStyle = "rgba(235, 243, 223, 0.74)";
  context.fillText("Participação por fase do período", 80, lowerY + 82);
  let startAngle = -Math.PI / 2;
  const centerX = 268;
  const centerY = lowerY + 263;
  report.distribution.forEach((item) => {
    const slice = item.value / 100 * Math.PI * 2;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.arc(centerX, centerY, 128, startAngle, startAngle + slice);
    context.closePath();
    context.fillStyle = item.color;
    context.fill();
    startAngle += slice;
  });
  context.beginPath();
  context.arc(centerX, centerY, 72, 0, Math.PI * 2);
  context.fillStyle = "#0a2112";
  context.fill();
  context.textAlign = "center";
  context.fillStyle = "#f5f5e3";
  context.font = "900 36px Arial";
  context.fillText("100%", centerX, centerY - 5);
  context.font = "700 18px Arial";
  context.fillStyle = "rgba(235, 243, 223, 0.7)";
  context.fillText("do período", centerX, centerY + 26);
  context.textAlign = "left";
  report.distribution.forEach((item, index) => {
    const y = lowerY + 152 + index * 66;
    context.fillStyle = item.color;
    context.fillRect(438, y - 17, 17, 17);
    context.font = "700 21px Arial";
    context.fillStyle = "#e9f1df";
    context.fillText(item.label, 476, y);
    context.textAlign = "right";
    context.font = "900 23px Arial";
    context.fillText(`${item.value}%`, 730, y);
    context.textAlign = "left";
  });
  context.fillStyle = "#f3cb4f";
  context.font = "800 26px Arial";
  context.fillText("PRINCIPAIS PONTOS", 830, lowerY + 52);
  context.font = "700 20px Arial";
  context.fillStyle = "rgba(235, 243, 223, 0.74)";
  context.fillText("Momentos de maior audiência", 830, lowerY + 82);
  report.growthPoints.forEach((point, index) => {
    const y = lowerY + 129 + index * 60;
    roundedRect(context, 828, y, 692, 46, 10);
    context.strokeStyle = "rgba(190, 231, 192, 0.2)";
    context.stroke();
    context.font = "900 21px Arial";
    context.fillStyle = "#f3cb4f";
    context.fillText(point.label, 850, y + 30);
    context.font = "700 18px Arial";
    context.fillStyle = "rgba(235, 243, 223, 0.76)";
    context.fillText(highlightLabel(index, report.period), 970, y + 29);
    context.textAlign = "right";
    context.font = "900 23px Arial";
    context.fillStyle = "#eaf6df";
    context.fillText(formatNumber(point.online), 1496, y + 30);
    context.textAlign = "left";
  });

  const footerY = 1920;
  drawPanel(context, 50, footerY, 1500, 244);
  context.fillStyle = "#f3cb4f";
  context.font = "800 25px Arial";
  context.fillText("LINHA DO TEMPO DA AUDIÊNCIA", 82, footerY + 52);
  const timeline = timelinePoints(report.points);
  timeline.forEach((point, index) => {
    const x = 110 + index / Math.max(1, timeline.length - 1) * 1320;
    if (index > 0) {
      context.strokeStyle = index % 2 ? "#2fe88a" : "#f3cb4f";
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(x - 230, footerY + 123);
      context.lineTo(x - 36, footerY + 123);
      context.stroke();
    }
    context.beginPath();
    context.arc(x, footerY + 123, 13, 0, Math.PI * 2);
    context.fillStyle = index % 2 ? "#2fe88a" : "#f3cb4f";
    context.fill();
    context.textAlign = "center";
    context.font = "800 19px Arial";
    context.fillStyle = "#f2f5e7";
    context.fillText(point.label, x, footerY + 165);
    context.font = "900 25px Arial";
    context.fillText(formatNumber(point.online), x, footerY + 197);
  });
  context.textAlign = "left";
  context.font = "italic 24px Arial";
  context.fillStyle = "#f3cb4f";
  context.fillText("Reggae é vida!", 52, 2214);
  context.textAlign = "right";
  context.font = "700 18px Arial";
  context.fillStyle = "rgba(235, 243, 223, 0.66)";
  context.fillText("Indicadores estimados de audiência e visitas", 1548, 2214);
  context.textAlign = "left";
}

function drawPanel(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  roundedRect(context, x, y, width, height, 18);
  const fill = context.createLinearGradient(x, y, x, y + height);
  fill.addColorStop(0, "rgba(8, 31, 16, 0.94)");
  fill.addColorStop(1, "rgba(2, 13, 7, 0.95)");
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = "rgba(116, 214, 129, 0.36)";
  context.lineWidth = 2;
  context.stroke();
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, radius);
    return;
  }
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.arcTo(x + width, y, x + width, y + safeRadius, safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.arcTo(x + width, y + height, x + width - safeRadius, y + height, safeRadius);
  context.lineTo(x + safeRadius, y + height);
  context.arcTo(x, y + height, x, y + height - safeRadius, safeRadius);
  context.lineTo(x, y + safeRadius);
  context.arcTo(x, y, x + safeRadius, y, safeRadius);
  context.closePath();
}

function coverImage(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawnWidth = image.width * scale;
  const drawnHeight = image.height * scale;
  context.drawImage(image, x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2, drawnWidth, drawnHeight);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function splitIntoFour(points: ReportPoint[]) {
  return Array.from({ length: 4 }, (_, index) => {
    const start = Math.floor(index * points.length / 4);
    const end = Math.floor((index + 1) * points.length / 4);
    return points.slice(start, end);
  });
}

function sparseLabels(points: ReportPoint[]) {
  const desired = Math.min(points.length, 6);
  return Array.from({ length: desired }, (_, index) => {
    const pointIndex = Math.round(index * (points.length - 1) / Math.max(1, desired - 1));
    return {
      index: pointIndex,
      label: points[pointIndex]?.label ?? "",
      position: pointIndex / Math.max(1, points.length - 1) * 100,
    };
  });
}

function timelinePoints(points: ReportPoint[]) {
  const desired = Math.min(points.length, 5);
  return Array.from({ length: desired }, (_, index) => points[Math.round(index * (points.length - 1) / Math.max(1, desired - 1))]!);
}

function donutGradient(distribution: AudienceReport["distribution"]) {
  let current = 0;
  const stops = distribution.map((item) => {
    const start = current;
    current += item.value;
    return `${item.color} ${start}% ${current}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function labelForPoint(date: Date, period: ReportPeriod) {
  if (period === "day") return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", hour12: false }).format(date).replace(" ", "");
  if (period === "week") return new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", "");
  return shortDateFormatter.format(date);
}

function periodLabel(period: ReportPeriod, start: Date, end: Date) {
  if (period === "day") return `Últimas 24 horas · ${shortDateFormatter.format(end)}`;
  if (period === "week") return `${shortDateFormatter.format(start)} a ${shortDateFormatter.format(end)}`;
  return `${shortDateFormatter.format(start)} a ${shortDateFormatter.format(end)}`;
}

function distributionLabel(index: number, period: ReportPeriod) {
  if (period === "day") return ["Madrugada", "Manhã", "Tarde", "Noite"][index];
  return ["Início", "Primeira metade", "Segunda metade", "Encerramento"][index];
}

function highlightLabel(index: number, period: ReportPeriod) {
  const labels = period === "day"
    ? ["Pico de audiência", "Crescimento consistente", "Maior estabilidade", "Alcance em alta", "Destaque do período"]
    : ["Ponto de maior alcance", "Crescimento consistente", "Audiência em alta", "Destaque do período", "Boa retenção"];
  return labels[index] ?? "Destaque do período";
}

function timelineLabel(index: number, period: ReportPeriod) {
  const labels = period === "day"
    ? ["Base do período", "Em crescimento", "Maior alcance", "Faixa estável", "Referência atual"]
    : ["Início", "Evolução", "Ponto de atenção", "Maior alcance", "Referência atual"];
  return labels[index] ?? "Referência";
}

function formatNumber(value: number) {
  return numberFormatter.format(Math.max(0, Math.round(value)));
}

function toFileDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
