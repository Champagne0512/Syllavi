export function createSupabaseClient() {
  const url = wx.getStorageSync('supabase_url') || '';
  const key = wx.getStorageSync('supabase_key') || '';

  if (!url || !key) {
    console.warn('Supabase credentials missing, fallback to mock data.');
    return null;
  }

  // Placeholder: actual client creation should leverage official JS SDK
  return {
    url,
    key,
    async rpc(path, payload) {
      return wx.request({
        url: `${url}/rest/v1/rpc/${path}`,
        method: 'POST',
        header: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        data: payload
      });
    }
  };
}
