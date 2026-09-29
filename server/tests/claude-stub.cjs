'use strict';
const fs = require('node:fs'), path = require('node:path');

// A stand-in for the real binary: same argument surface, same printed shapes,
// including the OSC 8 hyperlink that wraps the URL and the stdin code prompt.
// It stores its "credential" itself, exactly where the real one would, so the
// test can assert that nothing outside that directory ever holds it.
function stubClaude(directory, { code = 'good-code', fail = false, silent = false } = {}) {
    const file = path.join(directory, 'claude-stub.cjs');
    fs.writeFileSync(file, `#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const home=process.env.CLAUDE_CONFIG_DIR;
const credential=path.join(home,'.credentials.json');
const [group,action]=process.argv.slice(2);
if(group!=='auth')process.exit(2);
if(action==='status'){
  const saved=fs.existsSync(credential)?JSON.parse(fs.readFileSync(credential,'utf8')):null;
  process.stdout.write(JSON.stringify(saved
    ?{loggedIn:true,authMethod:'claudeai',email:saved.email,organization:{name:'Assinatura pessoal'}}
    :{loggedIn:false,authMethod:'none',apiProvider:'firstParty'})+'\\n');
  process.exit(0);
}
if(action==='logout'){fs.rmSync(credential,{force:true});process.exit(0);}
if(action!=='login')process.exit(2);
if(${JSON.stringify(silent)}){process.stdout.write('nothing useful\\n');process.exit(1);}
process.stdout.write('Opening browser to sign in\\u2026\\n');
process.stdout.write('If the browser didn\\'t open, visit: \\u001b]8;;\\u0007'+
  'https://claude.com/cai/oauth/authorize?code=true&client_id=fixture&state=abc'+
  '\\u001b]8;;\\u0007\\n');
process.stdout.write('Paste code here if prompted > ');
let input='';
process.stdin.on('data',chunk=>{input+=chunk;});
process.stdin.on('end',()=>{
  const pasted=input.trim();
  if(${JSON.stringify(fail)}||pasted!==${JSON.stringify(code)}){
    process.stderr.write('Invalid code\\n');process.exit(1);
  }
  fs.writeFileSync(credential,JSON.stringify({email:'linguista@example.org',token:'SEGREDO-'+pasted}),{mode:0o600});
  process.stdout.write('Login successful\\n');process.exit(0);
});
`, { mode: 0o755 });
    return file;
}
module.exports = { stubClaude };
