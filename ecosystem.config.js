module.exports = {
  apps: [
    {
      name: "busywms-backend",
      script: "node",
      args: "dist/app.js",
      cwd: "D:\\Ajay\\BusyWMS\\backend",
      watch: ["src"],
      ignore_watch: ["node_modules"],
      watch_delay: 1000,
      max_memory_restart: "500M",
      error_file: "logs/err.log",
      out_file: "logs/out.log",
      log_file: "logs/combined.log",
      env: {
        NODE_ENV: "development"
      },
      exec_mode: "fork"
    },
    {
      name: "busywms-frontend",
      script: "cmd.exe",
      args: ["/c", "npm run dev"],
      cwd: "D:\\Ajay\\BusyWMS\\frontend",
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "development"
      }
    }
  ]
};
