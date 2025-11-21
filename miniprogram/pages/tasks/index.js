import { MORANDI_COLORS } from '../../utils/colors';
import {
  createTask,
  deleteTask,
  fetchTasks,
  updateTask,
  updateTaskCompletion
} from '../../utils/supabase';

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
    loadingTasks: true,
    editorVisible: false,
    editingTask: null,
    saving: false,
    form: {
      type: 'homework',
      title: '',
      date: '',
      time: '',
      description: ''
    }
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
      const tasks = rows.map((row, idx) => {
        const progressPct =
          typeof row.progress === 'number'
            ? row.progress
            : row.is_completed
            ? 100
            : 30;
        return {
          id: row.id,
          type: row.type,
          title: row.title,
          deadline: formatDeadline(row.deadline),
          rawDeadline: row.deadline,
          description: row.description,
          progress: progressPct / 100,
          progressPct,
          course: row.related_course_id?.slice(0, 4)?.toUpperCase() || 'GEN',
          accent: MORANDI_COLORS[idx % MORANDI_COLORS.length],
          completed: row.is_completed
        };
      });
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
  },
  openCreate() {
    wx.vibrateShort({ type: 'light' });
    this.setData({
      editorVisible: true,
      editingTask: null,
      form: {
        type: this.data.activeTab,
        title: '',
        date: '',
        time: '',
        description: ''
      }
    });
  },
  openEdit(e) {
    const { id } = e.currentTarget.dataset;
    const task = this.data.tasks.find((t) => t.id === id);
    if (!task) return;
    wx.vibrateShort({ type: 'light' });
    const deadline = task.rawDeadline || '';
    let date = '';
    let time = '';
    if (deadline) {
      const d = new Date(deadline);
      if (!Number.isNaN(d.getTime())) {
        const month = `${d.getMonth() + 1}`.padStart(2, '0');
        const day = `${d.getDate()}`.padStart(2, '0');
        date = `${d.getFullYear()}-${month}-${day}`;
        const hour = `${d.getHours()}`.padStart(2, '0');
        const minute = `${d.getMinutes()}`.padStart(2, '0');
        time = `${hour}:${minute}`;
      }
    }
    this.setData({
      editorVisible: true,
      editingTask: task,
      form: {
        type: task.type,
        title: task.title,
        date,
        time,
        description: task.description || ''
      }
    });
  },
  closeEditor() {
    this.setData({ editorVisible: false, saving: false });
  },
  noop() {},
  changeType(e) {
    const { type } = e.currentTarget.dataset;
    this.setData({
      'form.type': type
    });
  },
  onTitleChange(e) {
    this.setData({
      'form.title': e.detail.value
    });
  },
  onDateChange(e) {
    this.setData({
      'form.date': e.detail.value
    });
  },
  onTimeChange(e) {
    this.setData({
      'form.time': e.detail.value
    });
  },
  onDescChange(e) {
    this.setData({
      'form.description': e.detail.value
    });
  },
  async submitTask() {
    if (this.data.saving) return;
    const { form, editingTask } = this.data;
    if (!form.title) {
      wx.showToast({ title: '请输入标题', icon: 'none' });
      return;
    }
    if (!form.date || !form.time) {
      wx.showToast({ title: '请选择截止时间', icon: 'none' });
      return;
    }

    const deadline = new Date(`${form.date}T${form.time}:00`);
    if (Number.isNaN(deadline.getTime())) {
      wx.showToast({ title: '时间格式不正确', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...' });
    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      const payload = {
        user_id: userId,
        type: form.type,
        title: form.title,
        description: form.description || null,
        deadline: deadline.toISOString()
      };

      if (!editingTask) {
        const [created] = await createTask(payload);
        wx.showToast({ title: '已创建', icon: 'success' });
        this.setData({ editorVisible: false, saving: false });
        // 重新加载，以保持与服务器一致
        this.loadTasks();
      } else {
        const [updated] = await updateTask(editingTask.id, payload);
        wx.showToast({ title: '已更新', icon: 'success' });
        this.setData({ editorVisible: false, saving: false });
        const tasks = this.data.tasks.map((t) =>
          t.id === editingTask.id
            ? {
                ...t,
                title: updated.title,
                deadline: formatDeadline(updated.deadline),
                rawDeadline: updated.deadline,
                type: updated.type,
                description: updated.description
              }
            : t
        );
        this.setData({ tasks });
      }
    } catch (err) {
      console.warn('save task failed', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
      this.setData({ saving: false });
    } finally {
      wx.hideLoading();
    }
  },
  async deleteCurrent() {
    const { editingTask } = this.data;
    if (!editingTask) return;
    wx.showModal({
      title: '删除任务',
      content: '删除后不可恢复，确认删除？',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...' });
        try {
          await deleteTask(editingTask.id);
          const tasks = this.data.tasks.filter((t) => t.id !== editingTask.id);
          this.setData({ tasks, editorVisible: false });
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch (err) {
          console.warn('delete task failed', err);
          wx.showToast({ title: '删除失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  }
});
