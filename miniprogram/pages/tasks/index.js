import { MORANDI_COLORS } from '../../utils/colors';
import { fetchTasks, updateTaskCompletion } from '../../utils/supabase';

const MOCK_TASKS = [
  {
    id: 'mock-1',
    type: 'homework',
    title: '操作系统实验报告',
    deadline: '11.24 23:59',
    progress: 0.45,
    progressPct: 45,
    course: 'OS',
    accent: '#9BB5CE'
  },
  {
    id: 'mock-2',
    type: 'exam',
    title: '线性代数小测',
    deadline: '11.26 08:00',
    progress: 0.2,
    progressPct: 20,
    course: 'Linear',
    accent: '#C9A5A0'
  },
  {
    id: 'mock-3',
    type: 'homework',
    title: 'AI 项目 Demo',
    deadline: '11.30 17:00',
    progress: 0.7,
    progressPct: 70,
    course: 'AI',
    accent: '#A3B18A'
  }
];

function formatDeadline(deadline) {
  if (!deadline) return 'TBD';
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return deadline;
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${month}.${day} ${hour}:${minute}`;
}

Page({
  data: {
    activeTab: 'homework',
    tasks: [],
    loadingTasks: true
  },
  onLoad() {
    this.loadTasks();
  },
  onShow() {
    if (this.getTabBar && this.getTabBar()) {
      this.getTabBar().setSelected(1);
    }
  },
  async loadTasks() {
    this.setData({ loadingTasks: true });
    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      const rows = await fetchTasks(userId);
      if (!rows || !rows.length) {
        throw new Error('empty tasks');
      }
      const tasks = rows.map((row, idx) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        deadline: formatDeadline(row.deadline),
        progress: row.is_completed ? 1 : 0.3,
        progressPct: row.is_completed ? 100 : 30,
        course: row.related_course_id?.slice(0, 4)?.toUpperCase() || 'GEN',
        accent: MORANDI_COLORS[idx % MORANDI_COLORS.length],
        completed: row.is_completed
      }));
      this.setData({ tasks, loadingTasks: false });
    } catch (err) {
      console.warn('Supabase tasks fallback', err);
      this.setData({ tasks: MOCK_TASKS, loadingTasks: false });
    }
  },
  switchTab(e) {
    const { tab } = e.currentTarget.dataset;
    if (tab === this.data.activeTab) return;
    wx.vibrateShort({ type: 'light' });
    this.setData({ activeTab: tab });
  },
  async markDone(e) {
    const { id } = e.currentTarget.dataset;
    const tasks = this.data.tasks.map((task) =>
      task.id === id
        ? { ...task, progress: 1, progressPct: 100, completed: true }
        : task
    );
    this.setData({ tasks });
    wx.vibrateShort({ type: 'light' });
    wx.showToast({ title: 'Nice Focus', icon: 'success' });

    try {
      await updateTaskCompletion(id, true);
    } catch (err) {
      console.warn('Unable to sync completion', err);
    }
  }
});
