"""Voice messages: PulseAudio capture to Opus/WebM and local media playback."""
import argparse
import json
import sys
import threading
import gi

gi.require_version('Gst', '1.0')
from gi.repository import Gst, GLib

parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=('record', 'play'))
parser.add_argument('path')
parser.add_argument('--device')
args = parser.parse_args()
Gst.init(None)
loop = GLib.MainLoop()
failed = False
ready = False
stopping = False


def emit(event, **values):
    print(json.dumps(dict(event=event, **values)), flush=True)


def command(value):
    global stopping
    if value == 'stop':
        if args.mode == 'record':
            if not stopping:
                stopping = True
                pipeline.send_event(Gst.Event.new_eos())
        else:
            loop.quit()
    elif args.mode == 'play' and value in ('play', 'pause'):
        if value == 'play' and ended[0]:
            pipeline.set_state(Gst.State.READY)
            ended[0] = False
        pipeline.set_state(Gst.State.PLAYING if value == 'play' else Gst.State.PAUSED)
    return False


def commands():
    for line in sys.stdin:
        GLib.idle_add(command, line.strip())
    GLib.idle_add(command, 'stop')


def message(bus, msg):
    global failed, ready
    if msg.type == Gst.MessageType.ERROR:
        error, detail = msg.parse_error()
        failed = True
        emit('error', message=error.message)
        loop.quit()
    elif msg.type == Gst.MessageType.EOS:
        emit('ended')
        if args.mode == 'record':
            loop.quit()
        else:
            ended[0] = True
            pipeline.set_state(Gst.State.PAUSED)
    elif msg.type == Gst.MessageType.STATE_CHANGED and msg.src == pipeline:
        old, state, pending = msg.parse_state_changed()
        if state == Gst.State.PLAYING:
            if not ready:
                ready = True
                emit('ready')
                if args.mode == 'record':
                    GLib.timeout_add_seconds(60, command, 'stop')
            emit('playing')
        elif state == Gst.State.PAUSED and ready:
            emit('paused')


pipeline = None
ended = [False]
try:
    if args.mode == 'record':
        pipeline = Gst.parse_launch('pulsesrc name=source ! audioconvert ! audioresample ! audio/x-raw,rate=48000,channels=1 ! opusenc bitrate=64000 ! webmmux ! filesink name=output')
        pipeline.get_by_name('output').set_property('location', args.path)
        if args.device:
            pipeline.get_by_name('source').set_property('device', args.device)
    else:
        pipeline = Gst.ElementFactory.make('playbin')
        pipeline.set_property('uri', Gst.filename_to_uri(args.path))
        pipeline.set_property('flags', 2)
        sink = Gst.ElementFactory.make('pulsesink')
        if args.device:
            sink.set_property('device', args.device)
        pipeline.set_property('audio-sink', sink)
    bus = pipeline.get_bus()
    bus.add_signal_watch()
    bus.connect('message', message)
    threading.Thread(target=commands, daemon=True).start()
    if pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
        raise RuntimeError('音声デバイスまたは音声コーデックを開始できません')
    loop.run()
except Exception as error:
    failed = True
    emit('error', message=str(error))
finally:
    if pipeline is not None:
        pipeline.set_state(Gst.State.NULL)
sys.exit(1 if failed else 0)
