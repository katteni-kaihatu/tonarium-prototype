"""Exercise the real Unity HUD and IME through local bridge diagnostics."""
import ctypes
import json
import os
import pathlib
import subprocess
import sys
import time

output = pathlib.Path(sys.argv[1]).resolve()
output.mkdir(parents=True, exist_ok=True)
for name in ('unity-pid', 'hud-state.json', 'messages.json'):
    (output / name).unlink(missing_ok=True)
engine = subprocess.check_output(['fcitx5-remote', '-n'], text=True).strip()
ime_state = subprocess.check_output(['fcitx5-remote'], text=True).strip()
process = subprocess.Popen(sys.argv[2:])
checks = []


def state():
    for attempt in range(20):
        try:
            return json.loads((output / 'hud-state.json').read_text())
        except (FileNotFoundError, ValueError):
            time.sleep(.05)
    raise RuntimeError('Could not read HUD diagnostic state')


def messages():
    try:
        return json.loads((output / 'messages.json').read_text())
    except (FileNotFoundError, ValueError):
        return []


def wait(predicate, description):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError('Probe exited: ' + description)
        try:
            if predicate():
                checks.append(description)
                print("PASS " + description, flush=True)
                return
        except (FileNotFoundError, ValueError):
            pass
        time.sleep(.05)
    raise RuntimeError(description + ': ' + str(state()))


try:
    deadline = time.monotonic() + 45
    while not (output / 'unity-pid').exists():
        if process.poll() is not None or time.monotonic() > deadline:
            raise RuntimeError('Unity did not start')
        time.sleep(.1)
    pid = (output / 'unity-pid').read_text().strip()
    window = subprocess.check_output(['xdotool', 'search', '--sync', '--onlyvisible', '--pid', pid], text=True, timeout=15).splitlines()[0]
    subprocess.run(['xdotool', 'windowactivate', '--sync', window], check=True)
    (output / 'window-id').write_text(window)
    time.sleep(1)

    def key(*keys):
        subprocess.run(['xdotool', 'key', '--window', window, '--delay', '180', *keys], check=True)

    xlib = ctypes.CDLL('libX11.so.6')
    xlib.XOpenDisplay.restype = ctypes.c_void_p
    xlib.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
    xlib.XDefaultRootWindow.restype = ctypes.c_ulong
    xlib.XSendEvent.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_long, ctypes.c_void_p]
    xlib.XFlush.argtypes = [ctypes.c_void_p]
    display = xlib.XOpenDisplay(None)
    class PointerEvent(ctypes.Structure):
        _fields_ = [('type', ctypes.c_int), ('serial', ctypes.c_ulong), ('send_event', ctypes.c_int),
                    ('display', ctypes.c_void_p), ('window', ctypes.c_ulong), ('root', ctypes.c_ulong),
                    ('subwindow', ctypes.c_ulong), ('time', ctypes.c_ulong), ('x', ctypes.c_int),
                    ('y', ctypes.c_int), ('x_root', ctypes.c_int), ('y_root', ctypes.c_int),
                    ('state', ctypes.c_uint), ('button', ctypes.c_uint), ('same_screen', ctypes.c_int)]
    class XEvent(ctypes.Union):
        _fields_ = [('pointer', PointerEvent), ('pad', ctypes.c_long * 24)]

    def click(x, y):
        for kind, mask, button in [(6, 1 << 6, 0), (4, 1 << 2, 1), (5, 1 << 3, 1)]:
            event = XEvent()
            event.pointer = PointerEvent(kind, 0, 1, display, int(window), xlib.XDefaultRootWindow(display),
                                         0, 0, x, y, x, y, 0, button, 1)
            xlib.XSendEvent(display, int(window), 0, mask, ctypes.byref(event))
            xlib.XFlush(display)
            time.sleep(.15)
        time.sleep(.3)

    key("Escape")
    wait(lambda: state()["cursor"] == "None", "Initial cursor is released")
    click(42, 42)
    wait(lambda: state()['menu'] and state()['cursor'] == 'None', 'Hamburger opens menu without locking cursor')
    click(365, 230)
    wait(lambda: state()['world'] == 'room' and not state()['menu'], 'World button changes to lounge through bridge')
    click(165, 42)
    wait(lambda: state()['menu'] and state()['cursor'] == 'None', 'World title opens menu')
    click(42, 42)
    wait(lambda: not state()['menu'], 'Hamburger closes menu')
    click(700, 400)
    wait(lambda: state()['cursor'] == 'Locked', 'World click still locks camera')
    key('Escape')
    wait(lambda: state()['cursor'] == 'None', 'Escape releases camera')
    key('Return')
    wait(lambda: state()['chatOpen'], 'Enter opens Unity chat')
    subprocess.run(['fcitx5-remote', '-s', 'mozc'], check=True)
    subprocess.run(['fcitx5-remote', '-o'], check=True)
    time.sleep(.5)
    expected = os.environ.get('TONARIUM_IME_EXPECTED', '日本語')
    key(*['period' if c == '.' else c for c in os.environ.get('TONARIUM_IME_ROMAJI', 'nihongo')])
    time.sleep(.5)
    assert state()['draft'] == '' and state()['chatOpen'], 'Preedit must not commit or close chat'
    key('space')
    time.sleep(.5)
    key('Return')
    wait(lambda: state()['draft'] == expected and state()['chatOpen'], 'IME confirmation preserves draft and open chat')
    time.sleep(.5)
    assert not any(m.get('message', {}).get('t') == 'chat' for m in messages()), 'IME confirmation submitted chat'
    key('Return')
    wait(lambda: len([m for m in messages() if m.get('message', {}).get('t') == 'chat']) == 1 and not state()['chatOpen'], 'Next Enter sends exactly once and closes chat')
    key('Return')
    wait(lambda: state()['chatOpen'], 'Chat reopens after sending')
    key('Return')
    wait(lambda: not state()['chatOpen'], 'Empty Enter closes chat without sending')
    assert len([m for m in messages() if m.get('message', {}).get('t') == 'chat']) == 1
    if os.environ.get('TONARIUM_IME_ITEMS') == '1':
        def open_item(item):
            temporary = output / 'hud-command.tmp'
            temporary.write_text(json.dumps(item))
            temporary.replace(output / 'hud-command.json')
            wait(lambda: state()['selected'] == item['id'], 'Unity opens ' + item['kind'])
        open_item({'id': 'hud-note', 'kind': 'note', 'text': '', 'color': '#fde68a', 'x': 2, 'z': 2})
        click(400, 510)
        key(*['period' if c == '.' else c for c in os.environ.get('TONARIUM_IME_ROMAJI', 'nihongo')])
        key('space', 'Return')
        wait(lambda: state()['noteDraft'] == expected, 'Note receives full Japanese text')
        subprocess.run(['import', '-window', window, str(output / 'note.png')], check=True)
        click(708, 580)
        wait(lambda: state()['selected'] is None, 'Note closes inside Unity')
        assert any(m.get('message', {}).get('action', {}).get('text') == expected for m in messages()), 'Note changes not saved'
        open_item({'id': 'hud-image', 'kind': 'image', 'url': (output / 'test-image.png').as_uri(), 'w': 256, 'h': 256, 'x': -2, 'z': 2})
        wait(lambda: state()['imageLoaded'], 'Image texture loads for Unity viewer')
        subprocess.run(['import', '-window', window, str(output / 'image.png')], check=True)
        click(820, 102)
        wait(lambda: state()['imageZoom'] > 1, 'Image zoom button works')
        click(950, 102)
        wait(lambda: state()['selected'] is None, 'Image closes inside Unity')
        assert not any(m.get('t') == 'openItem' for m in messages()), 'Native fallback window requested'
    click(950, 38)
    code = process.wait(timeout=15)
    assert code == 0, (output / 'result.json').read_text()
    checks.append('Return-to-2D button reaches bridge')
    (output / 'hud-result.json').write_text(json.dumps({'passed': True, 'checks': checks}, ensure_ascii=False, indent=2))
    print((output / 'hud-result.json').read_text())
except Exception as error:
    if 'window' in globals():
        subprocess.run(['import', '-window', window, str(output / 'failure.png')], timeout=5)
    (output / 'hud-result.json').write_text(json.dumps({'passed': False, 'checks': checks, 'error': str(error)}, ensure_ascii=False, indent=2))
    raise
finally:
    if engine:
        subprocess.run(['fcitx5-remote', '-s', engine])
    if ime_state in ('1', '2'):
        subprocess.run(['fcitx5-remote', '-c' if ime_state == '1' else '-o'])
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
