// 小组创建调试脚本
// 用于调试为什么创建小组后不是组长

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

const debugGroupCreation = async () => {
  try {
    console.log('=== 开始调试小组创建过程 ===');
    
    // 1. 检查用户ID
    const userId = 'demo-user'; // 与代码中保持一致
    console.log('1. 使用用户ID:', userId);
    
    // 2. 创建测试小组
    console.log('2. 创建测试小组...');
    const createGroupResponse = await fetch(`${SUPABASE_URL}/rest/v1/study_groups`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify([{
        name: '调试测试小组',
        description: '用于调试的小组',
        group_code: 'DEBUG01',
        max_members: 20,
        created_by: userId
      }])
    });
    
    if (!createGroupResponse.ok) {
      console.error('创建小组失败:', await createGroupResponse.text());
      return;
    }
    
    const createdGroup = await createGroupResponse.json();
    const groupId = createdGroup[0]?.id;
    console.log('3. 小组创建成功:', { id: groupId, ...createdGroup[0] });
    
    if (!groupId) {
      console.error('4. 无法获取小组ID');
      return;
    }
    
    // 3. 检查是否已存在成员记录
    console.log('4. 检查现有成员记录...');
    const checkMemberResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/group_members?group_id=eq.${groupId}&user_id=eq.${userId}`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );
    
    if (checkMemberResponse.ok) {
      const existingMembers = await checkMemberResponse.json();
      console.log('5. 现有成员记录:', existingMembers);
      
      if (existingMembers.length > 0) {
        console.log('6. 用户已经是该组成员:', existingMembers[0]);
        return;
      }
    }
    
    // 4. 添加成员
    console.log('7. 添加成员记录...');
    const addMemberResponse = await fetch(`${SUPABASE_URL}/rest/v1/group_members`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify([{
        group_id: groupId,
        user_id: userId,
        role: 'leader'
      }])
    });
    
    if (!addMemberResponse.ok) {
      console.error('8. 添加成员失败:', await addMemberResponse.text());
      return;
    }
    
    const memberResult = await addMemberResponse.json();
    console.log('9. 成员添加成功:', memberResult[0]);
    
    // 5. 最终验证
    console.log('10. 最终验证成员身份...');
    const finalCheckResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/group_members?group_id=eq.${groupId}&user_id=eq.${userId}`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );
    
    if (finalCheckResponse.ok) {
      const finalMembers = await finalCheckResponse.json();
      console.log('11. 最终成员状态:', finalMembers);
      
      const isLeader = finalMembers.some(m => 
        m.group_id === groupId && 
        m.user_id === userId && 
        m.role === 'leader'
      );
      
      console.log('12. 是否是组长:', isLeader);
      console.log('=== 调试完成 ===');
    }
    
  } catch (error) {
    console.error('调试过程中出错:', error);
  }
};

// 如果配置了环境变量，运行调试
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  debugGroupCreation();
} else {
  console.log('请配置环境变量 SUPABASE_URL 和 SUPABASE_ANON_KEY');
  console.log('或者在浏览器控制台中手动执行以下调试步骤');
}