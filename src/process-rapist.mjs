import * as ChildProcess from 'child_process';

function killAProcess() {

  var output = ChildProcess.execSync('ps -e | grep ffmpeg').toString();

  console.log(output);

  var lines = output.split('\n');

  var maxLine = Math.min(3, lines.length);
  var randLine = Math.floor(Math.random() * maxLine);

  var pid = parseInt(lines[randLine]);

  console.log(pid + " GOT RAPED");

  ChildProcess.execSync('kill ' + pid);
  // console.log(lines[randLine]);

  setTimeout(killAProcess, Math.random() * 15000 + 15000)

}

killAProcess();