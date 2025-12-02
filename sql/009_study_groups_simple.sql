-- ============================================
-- Syllabi 学习小组功能数据库表结构（云开发数据库兼容版）
-- ============================================

-- 1. 学习小组表
CREATE TABLE IF NOT EXISTS study_groups (
    _id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    avatar VARCHAR(200),
    description TEXT,
    groupCode VARCHAR(20) UNIQUE NOT NULL,
    maxMembers INT DEFAULT 20,
    memberCount INT DEFAULT 1,
    createdBy VARCHAR(50) NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 小组成员表
CREATE TABLE IF NOT EXISTS group_members (
    _id VARCHAR(50) PRIMARY KEY,
    groupId VARCHAR(50) NOT NULL,
    userId VARCHAR(50) NOT NULL,
    role VARCHAR(20) DEFAULT 'member',
    joinedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (groupId, userId)
);

-- 3. 小组任务表
CREATE TABLE IF NOT EXISTS group_tasks (
    _id VARCHAR(50) PRIMARY KEY,
    groupId VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    deadline DATE,
    createdBy TEXT,
    assignTo TEXT,
    completedBy TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. 小组聊天记录表
CREATE TABLE IF NOT EXISTS group_chats (
    _id VARCHAR(50) PRIMARY KEY,
    groupId VARCHAR(50) NOT NULL,
    userId VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    type VARCHAR(20) DEFAULT 'text',
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. 小组邀请申请表
CREATE TABLE IF NOT EXISTS group_invitations (
    _id VARCHAR(50) PRIMARY KEY,
    groupId VARCHAR(50) NOT NULL,
    userId VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    appliedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processedAt TIMESTAMP,
    UNIQUE (groupId, userId)
);