// Syllaby 管理后台 JavaScript

// 全局配置
const API_BASE = '/api';

// 工具函数
function getAuthHeaders() {
  const token = localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

// 日期格式化
function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

// 相对时间格式化
function formatRelativeTime(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  
  return formatDate(dateString);
}

// 文件大小格式化
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 数字千分位格式化
function formatNumber(num) {
  if (!num) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 百分比格式化
function formatPercentage(value, total) {
  if (!total || total === 0) return '0%';
  return ((value / total) * 100).toFixed(1) + '%';
}

// 生成随机颜色
function generateColor() {
  const colors = [
    '#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b',
    '#858796', '#5a5c69', '#2e59d9', '#17a673', '#2c9faf'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// 复制到剪贴板
function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showAlert('已复制到剪贴板', 'success');
    });
  } else {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showAlert('已复制到剪贴板', 'success');
  }
}

// 下载文件
function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 节流函数
function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// API 请求封装
async function apiRequest(url, options = {}) {
  try {
    const response = await fetch(API_BASE + url, {
      headers: getAuthHeaders(),
      ...options
    });
    
    if (response.status === 401) {
      // Token过期，跳转到登录页
      localStorage.removeItem('adminToken');
      sessionStorage.removeItem('adminToken');
      window.location.href = '/login';
      return;
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || '请求失败');
    }
    
    return data;
  } catch (error) {
    console.error('API请求错误:', error);
    throw error;
  }
}

// 显示确认对话框
function confirmDialog(message, callback) {
  if (confirm(message)) {
    callback();
  }
}

// 显示输入对话框
function promptDialog(title, defaultValue = '', callback) {
  const input = prompt(title, defaultValue);
  if (input !== null) {
    callback(input);
  }
}

// 表单验证
function validateForm(formElement) {
  const inputs = formElement.querySelectorAll('input[required], select[required], textarea[required]');
  let isValid = true;
  
  inputs.forEach(input => {
    if (!input.value.trim()) {
      input.classList.add('is-invalid');
      isValid = false;
    } else {
      input.classList.remove('is-invalid');
    }
  });
  
  return isValid;
}

// 清空表单
function clearForm(formElement) {
  formElement.reset();
  formElement.querySelectorAll('.is-invalid').forEach(element => {
    element.classList.remove('is-invalid');
  });
}

// 序列化表单数据
function serializeForm(formElement) {
  const formData = new FormData(formElement);
  const data = {};
  
  for (let [key, value] of formData.entries()) {
    if (data[key]) {
      if (Array.isArray(data[key])) {
        data[key].push(value);
      } else {
        data[key] = [data[key], value];
      }
    } else {
      data[key] = value;
    }
  }
  
  return data;
}

// 初始化工具提示
function initTooltips() {
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });
}

// 初始化弹出框
function initPopovers() {
  const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
  popoverTriggerList.map(function (popoverTriggerEl) {
    return new bootstrap.Popover(popoverTriggerEl);
  });
}

// 图表配置
const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top',
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      grid: {
        color: 'rgba(0, 0, 0, 0.05)'
      }
    },
    x: {
      grid: {
        display: false
      }
    }
  }
};

// 创建折线图
function createLineChart(ctx, data, options = {}) {
  return new Chart(ctx, {
    type: 'line',
    data: data,
    options: {
      ...chartDefaults,
      ...options
    }
  });
}

// 创建柱状图
function createBarChart(ctx, data, options = {}) {
  return new Chart(ctx, {
    type: 'bar',
    data: data,
    options: {
      ...chartDefaults,
      ...options
    }
  });
}

// 创建饼图
function createPieChart(ctx, data, options = {}) {
  return new Chart(ctx, {
    type: 'doughnut',
    data: data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
        }
      },
      ...options
    }
  });
}

// 表格排序
function sortTable(table, columnIndex, ascending = true) {
  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  
  rows.sort((a, b) => {
    const aValue = a.cells[columnIndex].textContent.trim();
    const bValue = b.cells[columnIndex].textContent.trim();
    
    // 尝试数字比较
    const aNum = parseFloat(aValue);
    const bNum = parseFloat(bValue);
    
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return ascending ? aNum - bNum : bNum - aNum;
    }
    
    // 字符串比较
    return ascending ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
  });
  
  rows.forEach(row => tbody.appendChild(row));
}

// 表格搜索
function filterTable(table, searchInput) {
  const tbody = table.querySelector('tbody');
  const rows = tbody.querySelectorAll('tr');
  const searchTerm = searchInput.value.toLowerCase();
  
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(searchTerm) ? '' : 'none';
  });
}

// 导出CSV
function exportToCSV(data, filename) {
  const headers = Object.keys(data[0] || {});
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(header => row[header] || '').join(','))
  ].join('\n');
  
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename || 'export.csv';
  link.click();
}

// 导出JSON
function exportToJSON(data, filename) {
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename || 'export.json';
  link.click();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
  // 初始化工具提示和弹出框
  initTooltips();
  initPopovers();
  
  // 初始化所有搜索输入框
  document.querySelectorAll('input[type="search"]').forEach(input => {
    input.addEventListener('input', debounce(function() {
      const tableId = input.getAttribute('data-table');
      if (tableId) {
        const table = document.getElementById(tableId);
        if (table) {
          filterTable(table, input);
        }
      }
    }, 300));
  });
  
  // 初始化所有排序按钮
  document.querySelectorAll('button[data-sort]').forEach(button => {
    button.addEventListener('click', function() {
      const tableId = this.getAttribute('data-table');
      const columnIndex = parseInt(this.getAttribute('data-column'));
      const currentSort = this.getAttribute('data-sort-order');
      const ascending = currentSort !== 'asc';
      
      if (tableId) {
        const table = document.getElementById(tableId);
        if (table) {
          sortTable(table, columnIndex, ascending);
          this.setAttribute('data-sort-order', ascending ? 'asc' : 'desc');
          
          // 更新图标
          const icon = this.querySelector('i');
          if (icon) {
            icon.className = ascending ? 'bi bi-sort-up' : 'bi bi-sort-down';
          }
        }
      }
    });
  });
});

// 导出全局函数
window.adminUtils = {
  formatDate,
  formatRelativeTime,
  formatFileSize,
  formatNumber,
  formatPercentage,
  copyToClipboard,
  downloadFile,
  debounce,
  throttle,
  apiRequest,
  confirmDialog,
  promptDialog,
  validateForm,
  clearForm,
  serializeForm,
  createLineChart,
  createBarChart,
  createPieChart,
  exportToCSV,
  exportToJSON
};