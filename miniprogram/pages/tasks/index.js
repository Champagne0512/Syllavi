const {
  DEMO_USER_ID,
  fetchTasks,
  updateTaskCompletion,
  deleteTask
} = require('../../utils/supabase');

Page({
  data: {
    loading: true,
    tasks: [],
    selectionMode: false,
    selectedTasks: [],
    showCompleteConfirm: false,
    showDeleteConfirm: false,
    statusBarHeight: 0
  },

  onLoad() {
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    });
    this.loadTasks();
  },

  onShow() {
    this.loadTasks();
  },

  async loadTasks() {
    this.setData({ loading: true });
    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      const tasks = await fetchTasks(userId);
      
      if (Array.isArray(tasks)) {
        // 格式化日期并排序
        const formattedTasks = tasks.map(task => ({
          ...task,
          formattedDeadline: this.formatDate(task.deadline)
        }));
        
        // 按完成状态和时间排序：未完成的在前，已完成的在后
        const sortedTasks = formattedTasks.sort((a, b) => {
          if (a.is_completed !== b.is_completed) {
            return a.is_completed ? 1 : -1;
          }
          return new Date(a.deadline) - new Date(b.deadline);
        });
        
        this.setData({ tasks: sortedTasks });
      } else {
        this.setData({ tasks: [] });
      }
    } catch (err) {
      console.warn('load tasks failed', err);
      this.setData({ tasks: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  formatDate(dateStr) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const dateKey = date.toISOString().split('T')[0];
    const todayKey = today.toISOString().split('T')[0];
    const tomorrowKey = tomorrow.toISOString().split('T')[0];
    
    if (dateKey === todayKey) return '今天';
    if (dateKey === tomorrowKey) return '明天';
    
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${month}月${day}日 ${hours}:${minutes}`;
  },

  enterSelectionMode() {
    this.setData({ 
      selectionMode: true, 
      selectedTasks: [] 
    });
    wx.vibrateShort({ type: 'light' });
  },
  
  exitSelectionMode() {
    this.setData({ 
      selectionMode: false, 
      selectedTasks: [] 
    });
  },
  
  toggleTaskSelection(e) {
    const { id } = e.currentTarget.dataset;
    const { selectedTasks } = this.data;
    const index = selectedTasks.indexOf(id);
    
    let newSelectedTasks;
    if (index === -1) {
      newSelectedTasks = [...selectedTasks, id];
    } else {
      newSelectedTasks = selectedTasks.filter(taskId => taskId !== id);
    }
    
    this.setData({ selectedTasks: newSelectedTasks });
    wx.vibrateShort({ type: 'light' });
  },
  
  showCompleteConfirm() {
    if (this.data.selectedTasks.length === 0) {
      wx.showToast({ title: '请先选择任务', icon: 'none' });
      return;
    }
    
    this.setData({ showCompleteConfirm: true });
  },
  
  hideCompleteConfirm() {
    this.setData({ showCompleteConfirm: false });
  },
  
  async completeSelectedTasks() {
    const { selectedTasks } = this.data;
    if (selectedTasks.length === 0) return;
    
    wx.showLoading({ title: '处理中...' });
    
    try {
      // 批量更新任务状态
      await Promise.all(
        selectedTasks.map(taskId => updateTaskCompletion(taskId, true))
      );
      
      wx.hideLoading();
      wx.showToast({ 
        title: `已完成 ${selectedTasks.length} 个任务`, 
        icon: 'success' 
      });
      
      // 退出选择模式并重新加载
      this.exitSelectionMode();
      this.loadTasks();
      
    } catch (err) {
      console.error('完成任务失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // 显示删除确认弹窗
  showDeleteConfirm() {
    if (this.data.tasks.length === 0) {
      wx.showToast({ title: '暂无任务可删除', icon: 'none' });
      return;
    }
    
    this.setData({ showDeleteConfirm: true });
  },

  // 隐藏删除确认弹窗
  hideDeleteConfirm() {
    this.setData({ showDeleteConfirm: false });
  },

  // 删除所有任务
  async deleteAllTasks() {
    const { tasks } = this.data;
    if (tasks.length === 0) return;
    
    wx.showLoading({ title: '删除中...' });
    
    try {
      // 批量删除所有任务
      await Promise.all(
        tasks.map(task => deleteTask(task.id))
      );
      
      wx.hideLoading();
      wx.showToast({ 
        title: `已删除 ${tasks.length} 个任务`, 
        icon: 'success' 
      });
      
      // 隐藏弹窗并重新加载
      this.hideDeleteConfirm();
      this.loadTasks();
      
    } catch (err) {
      console.error('删除任务失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  }
  },

  goBack() {
    wx.vibrateShort({ type: 'light' });
    wx.navigateBack();
  }
});