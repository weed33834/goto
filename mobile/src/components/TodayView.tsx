import TasksView from './TasksView';

// 今日视图:复用任务列表,仅启用"今日"过滤(无到期日或今天到期且未完成)。
export default function TodayView() {
  return <TasksView filterToday />;
}
