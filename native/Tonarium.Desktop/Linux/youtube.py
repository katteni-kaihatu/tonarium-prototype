#!/usr/bin/python3
import http.server
import json
import os
import sys
import threading
import uuid

os.environ['GDK_BACKEND'] = 'x11'
import gi
gi.require_version('Gtk', '3.0')
gi.require_version('GdkX11', '3.0')
gi.require_version('WebKit2', '4.1')
from gi.repository import Gtk, GdkX11, GLib, WebKit2

initial = json.loads(sys.stdin.readline())
page = initial['html'].encode('utf-8')
token = '/' + uuid.uuid4().hex + '/player.html'


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] != token:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(page)))
        self.end_headers()
        self.wfile.write(page)

    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
uri = f'http://127.0.0.1:{server.server_port}{token}?id=' + initial['id']
manager = WebKit2.UserContentManager()
manager.register_script_message_handler('tonarium')


def message(manager, result):
    value = json.loads(result.get_js_value().to_json(0))
    if isinstance(value, dict) and value.get('a') in ('ready', 'error', 'mediaPlay', 'mediaPause', 'mediaSeek'):
        print(json.dumps(value), flush=True)


manager.connect('script-message-received::tonarium', message)
view = WebKit2.WebView.new_with_user_content_manager(manager)
view.get_settings().set_media_playback_requires_user_gesture(False)
window = Gtk.Window(type=Gtk.WindowType.POPUP)
window.set_default_size(640, 340)
window.add(view)
window.connect('destroy', Gtk.main_quit)
window.show_all()
print(json.dumps({'window': window.get_window().get_xid()}), flush=True)


def navigation(view, decision, kind):
    if kind == WebKit2.PolicyDecisionType.NEW_WINDOW_ACTION:
        decision.ignore()
        return True
    if kind == WebKit2.PolicyDecisionType.NAVIGATION_ACTION:
        action = decision.get_navigation_action()
        if action.is_user_gesture() and not action.get_request().get_uri().startswith(uri):
            decision.ignore()
            return True
    return False


view.connect('decide-policy', navigation)
view.load_uri(uri)


def apply(command):
    if 'clock' in command:
        value = json.dumps(command['clock'])
        view.evaluate_javascript('window.applyClock && window.applyClock(' + value + ')', -1, None, None, None, None, None)
    elif 'size' in command:
        window.resize(max(1, int(command['size'][0])), max(1, int(command['size'][1])))
    return False


def read():
    try:
        for line in sys.stdin:
            command = json.loads(line)
            GLib.idle_add(apply, command)
    finally:
        GLib.idle_add(Gtk.main_quit)


threading.Thread(target=read, daemon=True).start()
try:
    Gtk.main()
finally:
    server.shutdown()
