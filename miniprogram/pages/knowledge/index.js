import { MORANDI_COLORS } from '../../utils/colors';
import { fetchResources } from '../../utils/supabase';

const MOCK_FOLDERS = [
  { id: 1, name: '高数', count: 12, tone: '#9BB5CE' },
  { id: 2, name: 'AI 工程', count: 8, tone: '#C9A5A0' },
  { id: 3, name: '文学', count: 5, tone: '#A3B18A' }
];

const MOCK_FILES = [
  { id: 11, name: 'Chapter_05.pdf', type: 'pdf', subject: '高数', previewable: true },
  { id: 12, name: 'Lab-Guideline.pptx', type: 'ppt', subject: 'AI 工程', previewable: true }
];

Page({
  data: {
    folders: [],
    files: [],
    filteredFiles: [],
    activeFolder: '全部',
    loading: true
  },
  onLoad() {
    this.loadResources();
  },
  onShow() {
    if (this.getTabBar && this.getTabBar()) {
      this.getTabBar().setSelected(2);
    }
  },
  async loadResources() {
    this.setData({ loading: true });
    try {
      const app = getApp();
      const userId = app?.globalData?.supabase?.userId;
      const rows = await fetchResources(userId);
      if (!rows || !rows.length) throw new Error('empty resources');

      const folderMap = {};
      rows.forEach((file) => {
        const name = file.subject || '未分类';
        folderMap[name] = (folderMap[name] || 0) + 1;
      });

      const folders = Object.keys(folderMap).map((name, idx) => ({
        id: idx,
        name,
        count: folderMap[name],
        tone: MORANDI_COLORS[idx % MORANDI_COLORS.length]
      }));

      const activeFolder = folders[0]?.name || '全部';
      this.setData(
        {
          folders,
          files: rows.map((file) => ({
            id: file.id,
            name: file.file_name,
            type: file.file_type,
            subject: file.subject || '未分类',
            previewable: true
          })),
          activeFolder,
          loading: false
        },
        () => this.updateFilteredFiles()
      );
    } catch (err) {
      console.warn('Supabase resources fallback', err);
      this.setData(
        {
          folders: MOCK_FOLDERS,
          files: MOCK_FILES,
          activeFolder: MOCK_FOLDERS[0].name,
          loading: false
        },
        () => this.updateFilteredFiles()
      );
    }
  },
  updateFilteredFiles() {
    const { files, activeFolder } = this.data;
    const filtered =
      activeFolder === '全部'
        ? files
        : files.filter((file) => file.subject === activeFolder);
    this.setData({ filteredFiles: filtered });
  },
  selectFolder(e) {
    const { name } = e.currentTarget.dataset;
    this.setData({ activeFolder: name }, () => this.updateFilteredFiles());
    wx.vibrateShort({ type: 'light' });
  },
  previewFile(e) {
    const { name } = e.currentTarget.dataset;
    wx.showToast({
      title: `预览 ${name}`,
      icon: 'none'
    });
  }
});
