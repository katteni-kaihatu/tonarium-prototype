#!/bin/sh
set -eu
if [ -n "${APPDIR:-}" ]; then
    prefix="$APPDIR/usr"
else
    prefix=/app
fi
triplet=x86_64-linux-gnu
export PATH="$prefix/bin:$PATH"
export LD_LIBRARY_PATH="$prefix/lib/$triplet:$prefix/lib/$triplet/pulseaudio:$prefix/lib/$triplet/libproxy:$prefix/lib/$triplet/vlc:$prefix/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export TONARIUM_PYTHON="$prefix/bin/tonarium-python"
export PYTHONHOME="$prefix"
export PYTHONPATH="$prefix/lib/python3/dist-packages"
export GI_TYPELIB_PATH="$prefix/lib/$triplet/girepository-1.0"
export GST_PLUGIN_SYSTEM_PATH="$prefix/lib/$triplet/gstreamer-1.0"
export GST_PLUGIN_SCANNER="$prefix/lib/$triplet/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner"
export PIPEWIRE_MODULE_DIR="$prefix/lib/$triplet/pipewire-0.3"
export PIPEWIRE_CONFIG_DIR="$prefix/share/pipewire"
export SPA_PLUGIN_DIR="$prefix/lib/$triplet/spa-0.2"
export GIO_EXTRA_MODULES="$prefix/lib/$triplet/gio/modules"
export GSETTINGS_SCHEMA_DIR="$prefix/share/glib-2.0/schemas"
export VLC_PLUGIN_PATH="$prefix/lib/$triplet/vlc/plugins"
export WEBKIT_EXEC_PATH="$prefix/lib/$triplet/webkit2gtk-4.1"
export WEBKIT_INJECTED_BUNDLE_PATH="$WEBKIT_EXEC_PATH/injected-bundle"
export XDG_DATA_DIRS="$prefix/share:${XDG_DATA_DIRS:-/usr/local/share:/usr/share}"
export SSL_CERT_FILE="$prefix/etc/ssl/certs/ca-certificates.crt"
export FONTCONFIG_PATH="$prefix/etc/fonts"
export FONTCONFIG_FILE="$prefix/etc/fonts/fonts.conf"
export GDK_BACKEND=x11
unset GTK_MODULES
if [ -n "${TONARIUM_PACKAGE_EXEC:-}" ]; then
    exec "$TONARIUM_PACKAGE_EXEC" "$@"
fi
exec "$prefix/lib/tonarium/Tonarium" "$@"
