import React from "react";
import {FinancialTrend} from "../common/FinancialTrend";
import type {ReportTrendBucket} from "../../lib/reportAnalytics";
export const OverviewAreaChart:React.FC<{rows:ReportTrendBucket[];range:string}>=({rows,range})=><FinancialTrend rows={rows} label={`Income and expenses trend for ${range}`}/>;
