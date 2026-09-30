import React from "react";
import { formatDate } from "../utils/formatDate";

export function Dashboard() {
  return <main><h1>Dashboard</h1><p>Updated {formatDate(new Date())}</p></main>;
}
