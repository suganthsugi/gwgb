import type { ApexOptions } from "apexcharts";
import Chart from "react-apexcharts";
import type { HourlyPoint } from "../api";
import { gw, hhmm } from "../format";
import { colors, seriesStyle } from "../theme";

interface Props {
  points: HourlyPoint[];
}

const toGw = (mw: number | null) => (mw === null ? null : mw / 1000);

/** FR-019: hourly forecast in GW; null hours make gaps. */
export default function OutlookChart({ points }: Props) {
  const series = [
    {
      name: "Forecast",
      type: "line",
      data: points.map((p) => ({ x: hhmm(p.time), y: toGw(p.forecast) })),
    },
  ];
  const options: ApexOptions = {
    chart: { id: "outlook", toolbar: { show: false }, animations: { enabled: false } },
    colors: [colors.forecast],
    stroke: { width: [3], dashArray: [seriesStyle.forecast.dash ? 6 : 0], curve: "straight" },
    xaxis: { type: "category", title: { text: "Hour (UTC)" } },
    yaxis: { title: { text: "GW" }, labels: { formatter: (v) => v.toFixed(1) } },
    tooltip: { y: { formatter: (v) => (v === null ? "no forecast" : gw(v * 1000)) } },
    legend: { show: true },
  };
  return <Chart type="line" height={320} series={series} options={options} />;
}
