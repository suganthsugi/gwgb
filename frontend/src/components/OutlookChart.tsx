import type { ApexOptions } from "apexcharts";
import Chart from "react-apexcharts";
import type { HourlyPoint } from "../api";
import { gw, hhmm } from "../format";
import { colors, seriesStyle } from "../theme";

interface Props {
  points: HourlyPoint[];
}

const toGw = (mw: number | null) => (mw === null ? null : mw / 1000);

/** FR-019: likely range as a band and the forecast as a dashed line, in GW. Null hours are gaps. */
export default function OutlookChart({ points }: Props) {
  const series = [
    {
      name: "Likely range (P10–P90)",
      type: "rangeArea",
      data: points.map((p) => ({
        x: hhmm(p.time),
        y: p.low === null || p.high === null ? null : [p.low / 1000, p.high / 1000],
      })),
    },
    {
      name: "Forecast",
      type: "line",
      data: points.map((p) => ({ x: hhmm(p.time), y: toGw(p.forecast) })),
    },
  ];
  const options: ApexOptions = {
    chart: { id: "outlook", toolbar: { show: false }, animations: { enabled: false } },
    colors: [colors.forecast, colors.forecast],
    fill: { opacity: [0.18, 1] },
    stroke: {
      width: [0, 3],
      dashArray: [0, seriesStyle.forecast.dash ? 6 : 0],
      curve: "straight",
    },
    xaxis: { type: "category", title: { text: "Hour (UTC)" } },
    yaxis: { title: { text: "GW" }, labels: { formatter: (v) => v.toFixed(1) } },
    tooltip: {
      shared: true,
      y: { formatter: (v) => (v === null || v === undefined ? "no forecast" : gw(v * 1000)) },
    },
    legend: { show: true },
  };
  return <Chart type="rangeArea" height={320} series={series} options={options} />;
}
