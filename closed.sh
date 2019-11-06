#!/bin/bash
ffmpeg -re -stream_loop -1 -re -i closed-15fps.flv -f flv rtmp://x.rtmp.youtube.com/live2/tgew-9huf-w4r1-0jf9
