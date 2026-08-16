/**
 * XCPO 引擎单元测试（Node，零依赖）
 * 运行：node test/engine.test.js
 */
'use strict';

const path = require('path');
const CONFIG = require(path.join(__dirname, '..', 'src', 'config.js'));
const Engine = require(path.join(__dirname, '..', 'src', 'engine.js'));

let pass = 0, fail = 0;
const failures = [];

function engine(cfg) {
  return Engine.create(cfg || CONFIG.DEFAULT_CONFIG);
}

/** 以"评论区"阈值判断 */
function scoreReply(text, opts) {
  const e = engine();
  const res = e.scoreArticle({ text, name: opts && opts.name, handle: (opts && opts.handle) || 'normal_user' }, {});
  return res;
}

function expectHidden(text, label, opts) {
  const res = scoreReply(text, opts);
  const thr = 14;
  if (res.score >= thr) {
    pass++;
  } else {
    fail++;
    failures.push(`✗ 应隐藏但未隐藏: ${label}\n    "${text}"\n    得分 ${res.score} < ${thr}\n    原因: ${res.reasons.join(' | ') || '无'}`);
  }
}

function expectVisible(text, label, opts) {
  const res = scoreReply(text, opts);
  const thr = 14;
  if (res.score < thr) {
    pass++;
  } else {
    fail++;
    failures.push(`✗ 不应隐藏但被隐藏: ${label}\n    "${text}"\n    得分 ${res.score} >= ${thr}\n    原因: ${res.reasons.join(' | ') || '无'}`);
  }
}

function topicSuppressionTest() {
  // 主推文在聊嫖娼新闻 → 回复里讨论嫖娼是正常讨论，不应被隐藏
  const e = engine();
  const mainRes = e.scoreText('李云迪嫖娼被拘，网友评论两极分化', { useEmojiNoise: false });
  const suppressTerms = new Set();
  const suppressPatterns = new Set();
  for (const h of mainRes.hits) {
    if (h.type === 'keyword') suppressTerms.add(h.term);
    if (h.type === 'pattern') suppressPatterns.add(h.term);
  }
  const replies = [
    '嫖娼就是不对，公众人物更该自律',
    '他嫖娼被抓纯属活该，支持警方',
    '嫖娼违法，判得好',
  ];
  let ok = true;
  for (const r of replies) {
    const res = e.scoreArticle({ text: r, name: '路人甲', handle: 'passerby' }, { suppressTerms, suppressPatterns });
    if (res.score >= 14) ok = false;
  }
  if (ok) { pass++; } else { fail++; failures.push('✗ 话题抑制失败：嫖娼新闻讨论被误杀'); }
}

console.log('==== XCPO 引擎测试 ====\n');

// ========== 用户提供的真实案例 ==========
console.log('--- 用户提供的钓鱼评论（应全部隐藏）---');
expectHidden('应该没人比我玩的开了吧🥑🤓我福不黑不信你看', '例1：玩的开+福不黑');
expectHidden('比我好看的没我骚🤏🚴比我骚的没我好看', '例2：比我骚');
expectHidden('我果然太涩了🌤️🍝有人想锐评一下我的福嘛', '例3：太涩+锐评我的福');
expectHidden('比她好看的没她骚比她骚的没她好看', '变体4：她人称版本');
expectHidden('比她好看的没她涩比她涩的没她好看', '变体5：她+涩版本');

// ========== 明确招嫖广告 ==========
console.log('\n--- 明确招嫖/色情广告（应全部隐藏）---');
expectHidden('招嫖 加微信 xiaojie888', '招嫖+微信');
expectHidden('全套300 包夜800 上门服务 电话13812345678', '全套+价格+电话');
expectHidden('有没有人约炮 一夜情 私我', '约炮+一夜情');
expectHidden('援交 学生妹 出台 一次1000', '援交+出台+价格');
expectHidden('裸聊 视频 免费 加QQ 123456789', '裸聊+QQ');
expectHidden('外围女 商务伴游 私密照', '外围+伴游+私密照');
expectHidden('看我主页 有惊喜 懂的来', '主页引流');
expectHidden('telegram: @girls_520 欢迎来聊', 'telegram 引流');
expectHidden('加v看私密照 你懂的', '加v看+私密照');
expectHidden('onlyfans.com/freexxx 关注领福利', 'onlyfans 外链');
expectHidden('想约的私我，价格好商量', '想约+私我');
expectHidden('寂寞难耐 想找人陪 晚上有空', '寂寞+陪');

// ========== 变形/绕过手法 ==========
console.log('\n--- 变形绕过（应全部隐藏）---');
expectHidden('我 福 不 黑 不信 你 看', '空格拆词');
expectHidden('玩 的 开 不 信 你 看', '空格拆词2');
expectHidden('有人想锐评一下我的肤嘛，不黑不白', '肤谐音变体');
expectHidden('比我骚的没我好看🤏比我好看的没我骚', '骚+变体');

// ========== 繁体 ==========
console.log('\n--- 繁体中文（应全部隐藏）---');
expectHidden('約炮嗎 一晚多少錢 私我', '繁体约炮');
expectHidden('裸照私密照 加我微信 懂的來', '繁体裸照');

// ========== 正常评论（绝不可误杀） ==========
console.log('\n--- 正常评论（应全部保留）---');
expectVisible('支持，分析得很到位', '正常支持');
expectVisible('太真实了哈哈哈哈哈', '正常感慨');
expectVisible('这波操作太骚了，稳！', '游戏用语"太骚了"');
expectVisible('周末约吗？一起打羽毛球', '正常约球');
expectVisible('这个柿子太涩了，不过挺好吃', '食物"太涩"');
expectVisible('我有福气遇到这么好的博主', '"我有福气"');
expectVisible('关注公众号有详细教程', '微信公众号正常语境');
expectVisible('这玩意能部署到实体老板电脑上，部署一次收2000，微信和支付宝能充值，会员自己充值，谁先上线到小红书谁抢占先机', '创业讨论(微信+收2000)');
expectVisible('这家快餐15元一份，挺好吃', '快餐价格');
expectVisible('微信支付很方便', '微信支付语境');
expectVisible('我微信你一下发地址', '微信聊天语境');
expectVisible('哪里有白嫖教程', '白嫖教程');
expectVisible('这个会员可以白嫖', '白嫖会员');
expectVisible('白嫖党表示很爽', '白嫖党');
expectVisible('白嫖看完整个教程再评论', '白嫖看');
expectVisible('200一晚 上门维修不包配件', '上门维修语境');
expectVisible('真假？？ Codex付费重置80美元/次？ 没看到有付费重置的地方。', '80美元/次 API计价');
expectVisible('酒店住一晚200块，性价比一般', '酒店一晚200');
expectVisible('我把团队常用的 27 个 skill 公开了，一条命令装完，我把每一个都拆开写了一遍。微信搜「AI 小橙书」，免费，不用注册。', '微信搜公众号(内容营销)');
expectVisible('Are you buying real AI - or just a new veneer? Look beyond the label: evaluate AI tools on architecture, security, and measurable ROI. Cloud & DevOps InfoQ Trends Report 2026 https://bit.ly/4fXWdAx', '正规公司短链(InfoQ报告)');
expectHidden('白嫖看片加微信', '白嫖+引流(真广告)');
expectVisible('一群人天天拿东北人下岗被迫卖淫说事儿。有没有想过，正是因为东北的工业文明发达，公民意识相对强烈，才能把黑历史记录下来。而河南四川贵州湖南等地全国卖的人，反而把下岗苦药含泪咽下去了呢？', '东北卖淫社会议题讨论');
expectVisible('嫖娼是违法的，公众人物更该自律', '嫖娼违法讨论');
expectVisible('新政策出台了，大家怎么看', '政策出台');
expectVisible('这家店明码标价，童叟无欺', '明码标价正常商业');
expectVisible('请问你们怎么收费？想咨询下服务项目', '正常咨询收费');
expectVisible('以前有卖身葬父的说法', '卖身葬父');
expectVisible('这里太无聊了，大家都散了', '无聊吐槽');
expectVisible('睡不着，有没有人推荐电影', '正常求推荐');
expectVisible('哈哈哈哈笑死我了', '纯搞笑');
expectVisible('好家伙，这波操作可以', '正常评论');
expectVisible('谢谢博主分享，学到了', '感谢分享');
expectVisible('微信读书的会员怎么退订？', '微信正常产品语境');
expectVisible('今天去体检，抽血化验一次多少钱？', '正常问价格');
expectVisible('我家猫太骚了，天天勾引我', '宠物玩笑（"我家猫"前缀）');
expectVisible('看我的皮肤状态，最近好多了', '护肤话题"看我的皮肤"');
expectVisible('我家狗好色，见到人就扑', '宠物玩笑2');
expectVisible('这羊肉有骚味，得多放点料酒', '骚味（食物）');
expectVisible('评论区的广告真是越来越多了', '吐槽广告本身');
expectVisible('举报这些发广告的账号', '正常举报言论');

// ========== 更多广告变体 ==========
console.log('\n--- 更多广告变体（应全部隐藏）---');
expectHidden('学生妹兼职 一晚上500 企鹅12345678', '学生妹+价格+企鹅');
expectHidden('加我主页 置顶有联系方式', '主页置顶引流');
expectHidden('有人想深入交流的吗 私信我', '深入交流+私信我');
expectHidden('凌晨两点 一个人 空虚 有一起的吗', '深夜空虚约');
expectVisible('感兴趣可以看看我简介', '简介引流(博主常规话术)');
expectHidden('88一晚上 优惠到月底 薇信我', '价格+薇信');
expectHidden('想看我的可以加微信', '想看我的+加微信');

// ========== 话题抑制 ==========
console.log('\n--- 话题抑制（嫖娼新闻讨论不被误杀）---');
topicSuppressionTest();

// ========== 用户自定义关键词 ==========
console.log('\n--- 自定义关键词 ---');
{
  const e = engine({ ...CONFIG.DEFAULT_CONFIG, keywords: { explicit: ['我的独家暗号'], strong: [], contact: [], baitStrong: [], baitWeak: [] } });
  const res = e.scoreArticle({ text: '想看我的独家暗号吗', name: 'x', handle: 'x' }, {});
  if (res.score >= 100) { pass++; } else { fail++; failures.push('✗ 自定义关键词未生效'); }
}

// ========== 昵称过滤 ==========
console.log('\n--- 昵称过滤（广告昵称直接隐藏）---');
{
  const e = engine();
  const check = (name, text, expectHidden, label) => {
    const res = e.scoreArticle({ text, name, handle: 'some_handle' }, {});
    const thr = 14;
    if ((res.score >= thr) === expectHidden) { pass++; }
    else {
      fail++;
      failures.push(`✗ ${label}: 昵称"${name}" 评论"${text}" 得分 ${res.score} ${expectHidden ? '应隐藏但未隐藏' : '不应隐藏但被隐藏'}`);
    }
  };
  // 用户案例：催情药昵称 + emoji 拆词
  check('👈催情💊春💊男用💊听话 🍂 🌈 💰', '哈哈', true, '催情药昵称(emoji拆词)');
  check('👈催情💊春💊男用💊听话 🍂 🌈 💰', 'j', true, '催情药昵称+单字评论');  // 短文本也要杀
  check('催情水批发', '随便聊聊', true, '催情水');
  check('春药专卖 加微', '顶', true, '春药+加微');
  check('听话水 失忆水 迷药', '有货', true, '迷药');
  check('招嫖小妹在线', '看看', true, '招嫖昵称');
  check('福利姬写真', '关注我', true, '福利姬');
  check('飞机杯批发店', '你好', true, '成人用品');
  check('加微信看私密照', '在吗', true, '引流昵称');
  // 正常昵称不误杀
  check('小明', '支持博主', false, '普通昵称');
  check('阿伟哥的日常', '顶一下', false, '阿伟哥(含"伟哥"子串但非广告)');
  check('小甜甜', '哈哈', false, '普通昵称2');
  check('程序员老王', '学到了', false, '普通昵称3');
  check('夜店小王子', '走起', false, '夜店(擦边但非硬词)');
  check('性感的猫', '喵', false, '性感(弱信号非硬词)');
}

// ========== 主页深查加分 ==========
console.log('\n--- 主页深查 ---');
{
  const e = engine();
  const pb = e.profileBonus({
    name: '小可爱',
    description: '欢迎私聊 加微信看私密照 服务全城',
    screen_name: 'girl_520',
    entities: { url: { urls: [{ expanded_url: 'https://t.me/xxx' }] } },
    created_at: new Date(Date.now() - 10 * 864e5).toISOString(),
  });
  if (pb.bonus >= 20) { pass++; } else { fail++; failures.push(`✗ 主页深查加分异常: ${pb.bonus}`); }
}

// ========== 汇总 ==========
console.log('\n==== 结果 ====');
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (failures.length) {
  console.log('\n失败明细：');
  failures.forEach((f) => console.log(f + '\n'));
  process.exit(1);
} else {
  console.log('全部通过 ✓');
}
