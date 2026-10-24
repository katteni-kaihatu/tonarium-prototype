#!/usr/bin/python3
import signal
import sys
import uuid
import gi

gi.require_version('Gst', '1.0')
from gi.repository import Gio, GLib, Gst

unix_signal_add = getattr(GLib, 'unix_signal_add', None)
if unix_signal_add is None:
    gi.require_version('GLibUnix', '2.0')
    from gi.repository import GLibUnix
    unix_signal_add = GLibUnix.signal_add

Gst.init(None)
bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
name = 'org.freedesktop.portal.Desktop'
path = '/org/freedesktop/portal/desktop'
interface = 'org.freedesktop.portal.ScreenCast'
session = None
pipeline = None
loop = GLib.MainLoop()


def request(method, signature, args, options):
    token = 'tonarium_' + uuid.uuid4().hex
    options['handle_token'] = GLib.Variant('s', token)
    request_path = '/org/freedesktop/portal/desktop/request/' + bus.get_unique_name()[1:].replace('.', '_') + '/' + token
    result = []
    wait = GLib.MainLoop()
    def response(connection, sender, object_path, iface, signal_name, parameters):
        result.append(parameters.unpack())
        wait.quit()
    subscription = bus.signal_subscribe(name, 'org.freedesktop.portal.Request', 'Response', request_path, None, Gio.DBusSignalFlags.NONE, response)
    try:
        bus.call_sync(name, path, interface, method, GLib.Variant(signature, tuple(args) + (options,)), None, Gio.DBusCallFlags.NONE, 30000, None)
        wait.run()
        code, payload = result[0]
        if code != 0:
            raise RuntimeError('画面共有がキャンセルされたか、デスクトップが共有を拒否しました')
        return payload
    finally:
        bus.signal_unsubscribe(subscription)


def sample(sink):
    value = sink.emit('pull-sample')
    buffer = value.get_buffer()
    ok, mapped = buffer.map(Gst.MapFlags.READ)
    if not ok:
        return Gst.FlowReturn.ERROR
    try:
        sys.stdout.buffer.write(mapped.data)
        sys.stdout.buffer.flush()
    except BrokenPipeError:
        loop.quit()
        return Gst.FlowReturn.EOS
    finally:
        buffer.unmap(mapped)
    return Gst.FlowReturn.OK


def message(bus, message):
    if message.type == Gst.MessageType.ERROR:
        error, debug = message.parse_error()
        print(error.message, file=sys.stderr)
        loop.quit()
    elif message.type == Gst.MessageType.EOS:
        loop.quit()


def stop(*args):
    loop.quit()
    return False


try:
    created = request('CreateSession', '(a{sv})', [], {'session_handle_token': GLib.Variant('s', 'tonarium_' + uuid.uuid4().hex)})
    session = created['session_handle']
    request('SelectSources', '(oa{sv})', [session], {'types': GLib.Variant('u', 3), 'multiple': GLib.Variant('b', False), 'cursor_mode': GLib.Variant('u', 2)})
    started = request('Start', '(osa{sv})', [session, ''], {})
    node, properties = started['streams'][0]
    result, fds = bus.call_with_unix_fd_list_sync(name, path, interface, 'OpenPipeWireRemote', GLib.Variant('(oa{sv})', (session, {})), GLib.VariantType.new('(h)'), Gio.DBusCallFlags.NONE, 30000, None, None)
    fd = fds.get(result.unpack()[0])
    # 共有元が最大4枚の場合もあるため、旧PipeWireの既定値8枚を使わない。
    pipeline = Gst.parse_launch(f'pipewiresrc fd={fd} path={node} min-buffers=1 keepalive-time=100 always-copy=true do-timestamp=true ! videoconvert ! videoscale add-borders=true ! videorate ! video/x-raw,format=BGRA,width=1280,height=720,framerate=15/1,pixel-aspect-ratio=1/1 ! appsink name=frames emit-signals=true max-buffers=1 drop=true sync=false')
    pipeline.get_by_name('frames').connect('new-sample', sample)
    gst_bus = pipeline.get_bus()
    gst_bus.add_signal_watch()
    gst_bus.connect('message', message)
    bus.signal_subscribe(name, 'org.freedesktop.portal.Session', 'Closed', session, None, Gio.DBusSignalFlags.NONE, stop)
    unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGTERM, stop)
    pipeline.set_state(Gst.State.PLAYING)
    loop.run()
except Exception as error:
    print(str(error), file=sys.stderr)
    sys.exit(1)
finally:
    if pipeline:
        pipeline.set_state(Gst.State.NULL)
    if session:
        try:
            bus.call_sync(name, session, 'org.freedesktop.portal.Session', 'Close', None, None, Gio.DBusCallFlags.NONE, 3000, None)
        except GLib.Error:
            pass
