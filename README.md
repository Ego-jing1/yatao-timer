# 牙套时间管家 V5.1 Realtime

新增：
- Supabase Realtime 实时同步
- 数据改变时其他设备自动刷新
- 数据不变时不轮询数据库
- 手动“读取云端”成功才弹窗
- 自动同步静默，不打扰使用

上传 GitHub 根目录文件：
index.html, style.css, app.js, sw.js, manifest.json

Supabase SQL：
如果之前没开启 Realtime，请执行 supabase.sql 里的 V5.1 Realtime 部分：
alter publication supabase_realtime add table public.aligner_records;
