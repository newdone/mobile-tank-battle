# 四人联网移动端坦克大战

一个 Canvas + WebSocket 的移动端网页坦克大战，支持最多 4 人同房间实时对战。

## 本地运行

```bash
npm install
npm start
```

打开 `http://localhost:3000`，第一台设备创建房间，其他设备输入房间号加入。手机和电脑需要能访问同一个服务器地址。

## 操作

- 左侧虚拟摇杆移动
- 右侧按钮开火
- 桌面调试可用 WASD / 方向键和空格

## GitHub Actions 部署

项目包含三个工作流：

- `.github/workflows/check.yml`：安装依赖并运行基础检查
- `.github/workflows/docker.yml`：把完整 Node WebSocket 服务发布到 GitHub Container Registry
- `.github/workflows/pages.yml`：把 `public/` 静态客户端发布到 GitHub Pages

GitHub Pages 只能托管静态文件，不能承载 WebSocket 后端。联网对战需要把 Docker 镜像部署到支持长连接的平台，例如 Render、Fly.io、Railway、云服务器或 Kubernetes。

如果前端在 GitHub Pages，访问时带上后端地址：

```text
https://你的用户名.github.io/仓库名/?server=wss://你的服务域名
```

如果直接部署 Docker 服务，服务会同时提供前端和 WebSocket，访问服务域名即可。

## Docker

```bash
docker build -t mobile-tank-battle .
docker run -p 3000:3000 mobile-tank-battle
```
