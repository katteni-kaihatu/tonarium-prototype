import os
import pathlib
import selectors
import subprocess
import time

helper = os.environ.get('TONARIUM_SCREENCAST_HELPER') or str(pathlib.Path(__file__).resolve().parents[2] / 'Tonarium.Desktop/Linux/screencast.py')
process = subprocess.Popen([os.environ.get('TONARIUM_PYTHON', '/usr/bin/python3'), helper], stdout=subprocess.PIPE)
try:
    received = 0
    target = 1280 * 720 * 4 * 5
    deadline = time.monotonic() + 180
    with selectors.DefaultSelector() as selector:
        selector.register(process.stdout, selectors.EVENT_READ)
        while received < target:
            if time.monotonic() > deadline:
                raise TimeoutError('Screen selection/capture timed out')
            if not selector.select(1):
                continue
            data = os.read(process.stdout.fileno(), min(65536, target - received))
            if not data:
                raise RuntimeError('Capture stopped before five frames')
            received += len(data)
    print(f'PASS ScreenCast: 5 frames, {received} bytes; no images saved or transmitted', flush=True)
finally:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
