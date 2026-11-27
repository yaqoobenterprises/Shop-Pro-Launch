import React from "react";
import type { ReportTrendBucket } from "../../lib/reportAnalytics";
import { CashFlowChart } from "../charts/CashFlowChart";

export const OverviewAreaChart: React.FC<{ rows: ReportTrendBucket[]; range: string }> = props => <CashFlowChart {...props} />;
