import type { ApexOptions } from "apexcharts";
import Chart from "react-apexcharts";
import type { HourlyPoint } from "../api";
import { gw, hhmm } from "../format";
import { colors, seriesStyle } from "../theme";

interface Props {
  points: HourlyPoint[];
  showActuals: boolean;
}

const toGw = (mw: number | null) => (mw === null ? null : mw / 1000);

/** FR-019: likely range as a band, the forecast as a dashed amber line and, when shown, the
 * actual as a solid teal line, in GW. Null hours are gaps. */
export default function OutlookChart({ points, showActuals }: Props) {
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
    ...(showActuals
      ? [
          {
            name: "Actual",
            type: "line",
            data: points.map((p) => ({ x: hhmm(p.time), y: toGw(p.actual) })),
          },
        ]
      : []),
  ];
  const dash = (solid: boolean) => (solid ? 0 : 6);
  const options: ApexOptions = {
    chart: { id: "outlook", toolbar: { show: false }, animations: { enabled: false } },
    colors: [colors.forecast, colors.forecast, colors.actual],
    fill: { opacity: [0.18, 1, 1] },
    stroke: {
      width: [0, 3, 3],
      dashArray: [0, dash(!seriesStyle.forecast.dash), dash(!seriesStyle.actual.dash)],
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
