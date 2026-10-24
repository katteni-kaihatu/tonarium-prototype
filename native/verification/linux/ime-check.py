import pathlib
import subprocess
import sys
import time

output = pathlib.Path(sys.argv[1]).resolve()
output.mkdir(parents=True, exist_ok=True)
(output / 'window-id').unlink(missing_ok=True)
(output / 'unity-pid').unlink(missing_ok=True)
previous_engine = subprocess.check_output(['fcitx5-remote', '-n'], text=True).strip()
previous_state = subprocess.check_output(['fcitx5-remote'], text=True).strip()
process = subprocess.Popen(sys.argv[2:])
try:
    deadline = time.monotonic() + 30
    unity_started = False
    while not (output / 'window-id').exists():
        if (output / 'unity-pid').exists() and not unity_started:
            pid = (output / 'unity-pid').read_text().strip()
            unity_window = subprocess.check_output(['xdotool', 'search', '--sync', '--onlyvisible', '--pid', pid], text=True).splitlines()[0]
            subprocess.run(['xdotool', 'windowactivate', '--sync', unity_window], check=True)
            time.sleep(1)
            subprocess.run(['xdotool', 'key', '--window', unity_window, 'Return'], check=True)
            unity_started = True
        if process.poll() is not None or time.monotonic() > deadline:
            raise RuntimeError('IME test window did not open')
        time.sleep(0.1)
    window = (output / 'window-id').read_text().strip()
    if not unity_started:
        subprocess.run(['xdotool', 'windowactivate', '--sync', window], check=True)
    time.sleep(1)
    subprocess.run(['fcitx5-remote', '-s', 'mozc'], check=True)
    subprocess.run(['fcitx5-remote', '-o'], check=True)
    time.sleep(0.5)
    subprocess.run(['xdotool', 'key', '--window', window, '--delay', '180', 'n', 'i', 'h', 'o', 'n', 'g', 'o'], check=True)
    time.sleep(1)
    subprocess.run(['xdotool', 'key', '--window', window, 'space'], check=True)
    time.sleep(1)
    subprocess.run(['xdotool', 'key', '--window', window, 'Return'], check=True)
    if unity_started:
        time.sleep(1)
        state = (output / 'input-state.txt').read_text()
        if 'text=日本語' not in state or 'sent=0' not in state or process.poll() is not None:
            raise RuntimeError('IME confirmation submitted chat prematurely: ' + state)
        subprocess.run(['xdotool', 'key', '--window', window, 'Return'], check=True)
    code = process.wait(timeout=50)
    print((output / 'result.json').read_text())
    sys.exit(code)
finally:
    if previous_engine:
        subprocess.run(['fcitx5-remote', '-s', previous_engine])
    if previous_state in ('1', '2'):
        subprocess.run(['fcitx5-remote', '-c' if previous_state == '1' else '-o'])
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
