#!/bin/bash
while [[ 1 ]]; do
  ffmpeg -re -stream_loop -1 -fflags +genpts -re -i closed.flv -r 15 -f flv rtmp://a.rtmp.youtube.com/live2/840v-xz8s-bvuc-17fb
done
