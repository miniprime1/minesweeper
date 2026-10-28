const test=require('node:test');
const assert=require('node:assert/strict');
const {assetPath,validSize,validLayout,trustedURL,allowedExternal}=require('../../electron/policy.cjs');
test('local assets cannot escape the packaged web root',()=>{
  const root='/app/web';
  assert.equal(assetPath(root,'minesweeper://app/assets/Tile.png'),'/app/web/assets/Tile.png');
  assert.equal(assetPath(root,'https://example.com/index.html'),null);
  assert.equal(assetPath(root,'minesweeper://app/%2e%2e%2fsecret'),null);
  assert.equal(assetPath(root,'minesweeper://app/%00'),null);
  assert.equal(assetPath(root,'minesweeper://app/a%5Cb'),null);
});
test('native window IPC accepts bounded integer dimensions only',()=>{
  assert.equal(validSize({width:282,height:363}),true);
  for(const value of [null,{}, {width:Infinity,height:363},{width:281.5,height:363},{width:10000,height:363},{width:282,height:0}])assert.equal(validSize(value),false);
  assert.equal(trustedURL('minesweeper://app/index.html'),true);
  assert.equal(trustedURL('minesweeper://elsewhere/index.html'),false);
});
test('external links are restricted to the resource attribution page',()=>{
  assert.equal(allowedExternal('https://github.com/CobaltXII/Minesweeper'),true);
  assert.equal(allowedExternal('file:///etc/passwd'),false);
  assert.equal(allowedExternal('https://evil.example/CobaltXII/Minesweeper'),false);
  assert.equal(allowedExternal('https://username@github.com/CobaltXII/Minesweeper'),false);
  for(const url of ['https://opensource.org/license/mit','https://github.com/wildptr/winmine/tree/master/data','https://github.com/jdan/98.css'])assert.equal(allowedExternal(url),true);
  for(const url of ['https://github.com/jdan/98.css/evil','https://github.com/jdan/98.css?redirect=evil','https://opensource.org/other','http://github.com/jdan/98.css'])assert.equal(allowedExternal(url),false);
});
test('layout IPC accepts presets and temporary menu or dialog extents',()=>{
  for(const base of [{width:170,height:251},{width:282,height:363},{width:506,height:363}]){
    assert.equal(validLayout({base,extent:{...base}}),true);
    assert.equal(validLayout({base,extent:{width:Math.max(base.width,380),height:Math.max(base.height,460)}}),true);
  }
  assert.equal(validLayout({base:{width:1024,height:1024},extent:{width:1600,height:1600}}),true);
});
test('layout IPC rejects malformed dimensions and extents smaller than the game',()=>{
  const base={width:282,height:363},extent={...base};
  for(const value of [null,{}, {base}, {extent},
    {base,extent:{width:281,height:363}},
    {base,extent:{width:282,height:362}},
    {base:{width:1025,height:363},extent:{width:1025,height:363}},
    {base,extent:{width:1601,height:363}},
    {base,extent:{width:282,height:1601}},
    {base:{width:'282',height:363},extent},
    {base,extent:{width:Infinity,height:363}},
    {base,extent:{width:282,height:363.5}}]){
    assert.equal(validLayout(value),false);
  }
});
