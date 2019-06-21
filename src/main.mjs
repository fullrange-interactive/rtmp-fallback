import * as ChildProcess from 'child_process';
import fs from 'fs';

import RtmpInputStream from './Classes/RtmpInputStream';
import RtmpOutputStream from './Classes/RtmpOutputStream';
import FallbackVideoPlayer from './Classes/FallbackVideoPlayer';
import Log from './Classes/Log';

import Config from './Config';

function restartFallback(){

  stopService();
  setTimeout(startService, 3000);

}

function startService(){

  Log.say("Starting RTMP fallback service...");

  Promise.all([
    outputStream.init(),
    inputStream.init(),
    fallbackVideo.init()
  ])
  .then((data) => {

    try{

      let outputStreamState = data[0];
      let inputStreamState = data[1];
      let fallbackVideoDuration = data[2];

      Log.say(`OutputStream initalized. Currently ${outputStreamState}.`);
      Log.say(`InputStream initalized. Currently ${inputStreamState}.`);
      Log.say(`FallbackVideoPlayer initalized.`);

      //Init input state are always offline, even if we have stream on input.
      //So, start the fallback video, waiting for the input stream to be stable.
      fallbackVideo.play();

    }catch(e){

      throw new Error(e);

    }

  })
  .catch((e) => {

    Log.say("Error while starting rtmp fallback service...", e);
    throw new Error(e);

  })

}

function stopService(){

  Log.say("Stopping RTMP fallback service...");

  outputStream.stop();
  inputStream.stop();
  fallbackVideo.stop();

}



let outputStream = new RtmpOutputStream(Config.rtmpOutputStream, {

  onExit: (error) => {

    Log.say(`OutputStream exited: ${error}`);
    restartFallback();

  }

})

let inputStream = new RtmpInputStream(Config.rtmpInputStream, {
  onStatusChange: (currentStatus, previousStatus) => {

    Log.say(`Status changed from ${previousStatus} to ${currentStatus}`);

    switch(currentStatus){

      case RtmpInputStream.status.offline:

        fallbackVideo.play();

        break;


      case RtmpInputStream.status.connectionPending:

        fallbackVideo.play();

        break;


      case RtmpInputStream.status.online:

        fallbackVideo.pause();

        break;

    }

  },
  onExit: (error, errorCode) => {

    Log.say(`InputStream exited: ${error}`)

  },
  onData: (frame) => {

    if(outputStream.currentStatus === RtmpOutputStream.status.online)
      outputStream.write(frame);

  }
});

let fallbackVideo = new FallbackVideoPlayer(Config.fallbackFilePath, {

  onData: (frame) => {

    if(inputStream.currentStatus !== RtmpInputStream.status.online && outputStream.currentStatus === RtmpOutputStream.status.online)
      outputStream.write(frame);

  }

})


startService();