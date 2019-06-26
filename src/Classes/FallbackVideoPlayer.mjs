import * as ChildProcess from 'child_process';
import fs from 'fs';

import Log from './Log';

import Config from '../Config';

class FallbackVideoPlayer{

  constructor(filePath, config){

    this.filePath = filePath;
    this.config = config;

    this.enabled = false;

    this.ffmpegProcess = null;
    this.ffmpegLogStream = null;

  }

  init(){

    return new Promise((resolve, reject) => {

      try{

        this.ffmpegLogStream = fs.createWriteStream(`${Config.logBasePath}/ffmpegfallbacklog`);

        this.ffmpegProcess = ChildProcess.spawn('ffmpeg', (`-re -stream_loop -1 -i ${this.filePath} -ar 44100 -c copy -f mpegts -`).split(" "));
        this.ffmpegProcess.stdout.on("data", this.onData.bind(this));
        this.ffmpegProcess.on("exit", this.onFfmpegExit.bind(this));
        this.ffmpegProcess.stderr.on("data", (msg) => { if(this.ffmpegLogStream !== null) this.ffmpegLogStream.write(msg) });

        Log.say("Fallback init");

        resolve();

      }
      catch(e){

        reject(e);

      }

    })

  }

  onFfmpegExit(errorCode){

    if(typeof(this.config.onExit) !== 'undefined')
      this.config.onExit(`ffmpeg fallback exit with error code ${errorCode}. More information in log ${Config.logBasePath}/ffmpegfallbacklog`);

  }

  play(){

    this.enabled = true;

    Log.say("Now playing fallback video...");

  }

  pause(){

    Log.say("Fallback video stopped...");

    this.enabled = false;

  }

  stop(){

    if(this.ffmpegProcess === null)
      return;

    this.ffmpegProcess.stdout.unref();
    this.ffmpegProcess.stderr.unref();
    this.ffmpegProcess.kill('SIGKILL');
    this.ffmpegProcess = null;

    this.ffmpegLogStream.end()
    this.ffmpegLogStream = null;    

    Log.say("Fallback stopped");    

  }

  onData(frame){

    if(typeof(this.config.onData) !== 'undefined' && this.enabled){
      this.config.onData(frame);
    }

  }

}

export default FallbackVideoPlayer;