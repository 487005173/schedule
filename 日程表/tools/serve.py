#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本地预览服务（比 python -m http.server 更省心）

用法：  python tools/serve.py          # 默认端口 8931
        python tools/serve.py 9000     # 指定端口

特点：
  * 找不到的路径自动回退到 index.html —— 手输网址多带几个字符也不会看到 404；
  * 启动时直接打印可以点开的预览地址。
"""
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8931
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_error(self, code, message=None, explain=None):
        # 404 一律回退到首页，避免手输网址出错时看到错误页
        if code == 404 and self.command in ('GET', 'HEAD'):
            self.path = '/index.html'
            return self.do_GET()
        return super().send_error(code, message, explain)

    def log_message(self, fmt, *args):
        # 只记非 200/304 的请求，日志清爽一些
        try:
            status = str(args[1])
        except Exception:
            status = ''
        if status.startswith(('4', '5')):
            sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))
            sys.stderr.flush()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', PORT), Handler) as httpd:
    print('服务目录：%s' % ROOT, flush=True)
    print('预览地址：http://127.0.0.1:%d/index.html' % PORT, flush=True)
    print('按 Ctrl+C 停止', flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
