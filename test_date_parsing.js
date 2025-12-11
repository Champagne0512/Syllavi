// 测试日期解析问题
function formatDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

console.log('=== 测试日期解析问题 ===');

// 模拟任务数据加载中处理过的任务对象
const task1 = {
  deadline: '12.15 14:30',  // 格式化后的日期字符串
  rawDeadline: '2025-12-15T14:30:00.000Z'  // 原始 ISO 日期字符串
};

const task2 = {
  deadline: '12.05 09:00',
  rawDeadline: '2025-12-05T09:00:00.000Z'
};

const todayKey = formatDateKey(new Date());
console.log(`今日日期: ${todayKey}`);

// 测试当前的日期解析逻辑
console.log('\n测试日期解析:');
console.log(`task1.deadline: ${task1.deadline}`);
console.log(`new Date(task1.deadline): ${new Date(task1.deadline)}`);
console.log(`new Date(task1.deadline).getTime(): ${new Date(task1.deadline).getTime()}`);
console.log(`isNaN(new Date(task1.deadline)): ${isNaN(new Date(task1.deadline).getTime())}`);

console.log(`\ntask1.rawDeadline: ${task1.rawDeadline}`);
console.log(`new Date(task1.rawDeadline): ${new Date(task1.rawDeadline)}`);

console.log(`\ntask2.deadline: ${task2.deadline}`);
console.log(`new Date(task2.deadline): ${new Date(task2.deadline)}`);
console.log(`new Date(task2.rawDeadline): ${new Date(task2.rawDeadline)}`);

// 检查解析后的日期与今天的比较
const deadline1 = new Date(task1.deadline || task1.rawDeadline);
const deadline2 = new Date(task2.rawDeadline); // 正确方式

console.log(`\n比较结果:`);
console.log(`使用task1.deadline解析 - deadline1: ${deadline1}, isNaN: ${isNaN(deadline1.getTime())}`);
console.log(`使用task1.rawDeadline解析 - deadline1: ${deadline2}`);

const todayStart = new Date(todayKey);
todayStart.setHours(0, 0, 0, 0);
console.log(`todayStart: ${todayStart}`);

// 如果使用错误的解析方式
if (!isNaN(deadline1.getTime()) && deadline1 < todayStart) {
  console.log(`错误解析结果: task1 被认为过期 (deadline1 < todayStart: ${deadline1 < todayStart})`);
} else {
  console.log('错误解析结果: task1 未过期或日期无效');
}

// 如果使用正确的解析方式
if (deadline2 < todayStart) {
  console.log(`正确解析结果: task2 过期 (deadline2 < todayStart: ${deadline2 < todayStart})`);
} else {
  console.log('正确解析结果: task2 未过期');
}