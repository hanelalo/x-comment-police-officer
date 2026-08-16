/**
 * XCPO (X Comment Police Officer) - 配置与规则库
 *
 * 所有检测规则集中在这里。每条规则 = 权重(weight) + 分类(category)。
 * 权重含义：
 *   explicit 100  → 明确招嫖/性交易词，命中即杀
 *   strong   50   → 明确色情广告/擦边交易词
 *   contact  25   → 联系方式/引流词
 *   baitStrong 14 → 高置信钓鱼话术（例：我福不黑 / 玩的开）
 *   baitWeak  8   → 泛诱导话术（需要叠加其他信号）
 * 回复评论阈值 reply=14，信息流阈值 feed=25（comments 模式）/16（everywhere 模式）
 */
(function (global) {
  'use strict';

  const VERSION = '1.0.0';

  /** 扁平关键词表。t=词条，w=权重，c=分类 */
  const KEYWORDS = [
    // ---------- explicit 100：明确招嫖 / 性交易 ----------
    // 注意：不设「嫖」单字——「白嫖」是 B 站/游戏圈正常用语（免费蹭），单字误杀面太大
    { t: '招嫖', w: 100, c: 'explicit' },
    { t: '嫖娼', w: 100, c: 'explicit' },
    { t: '卖淫', w: 100, c: 'explicit' },
    { t: '賣淫', w: 100, c: 'explicit' },
    { t: '援交', w: 100, c: 'explicit' },
    { t: '出台', w: 100, c: 'explicit' },
    { t: '包夜', w: 100, c: 'explicit' },
    { t: '包养', w: 100, c: 'explicit' },
    { t: '一夜情', w: 100, c: 'explicit' },
    { t: '約炮', w: 100, c: 'explicit' },
    { t: '约炮', w: 100, c: 'explicit' },
    { t: '约p', w: 100, c: 'explicit' },
    { t: '约P', w: 100, c: 'explicit' },
    { t: '炮友', w: 100, c: 'explicit' },
    { t: '外围', w: 100, c: 'explicit' },
    { t: '外圍', w: 100, c: 'explicit' },
    { t: '外围女', w: 100, c: 'explicit' },
    { t: '伴游', w: 100, c: 'explicit' },
    { t: '伴遊', w: 100, c: 'explicit' },
    { t: '商务伴游', w: 100, c: 'explicit' },
    { t: '楼凤', w: 100, c: 'explicit' },
    { t: '樓鳳', w: 100, c: 'explicit' },
    { t: '莞式服务', w: 100, c: 'explicit' },
    { t: '莞式', w: 100, c: 'explicit' },
    { t: '全套服务', w: 100, c: 'explicit' },
    { t: '全套', w: 100, c: 'explicit' },
    { t: '半套', w: 100, c: 'explicit' },
    { t: '特殊服务', w: 100, c: 'explicit' },
    { t: '上门服务', w: 100, c: 'explicit' },
    { t: '性服务', w: 100, c: 'explicit' },
    { t: '坐台', w: 100, c: 'explicit' },
    { t: '卖身', w: 100, c: 'explicit' },
    { t: '色情交易', w: 100, c: 'explicit' },
    { t: '性交易', w: 100, c: 'explicit' },
    { t: '明码标价', w: 100, c: 'explicit' },
    { t: '服务项目', w: 100, c: 'explicit' },
    { t: '价格表', w: 100, c: 'explicit' },
    { t: '怎么收费', w: 100, c: 'explicit' },
    { t: '怎么联系', w: 100, c: 'explicit' },

    // ---------- strong 50：明确的色情广告 / 擦边交易 ----------
    { t: '裸聊', w: 50, c: 'strong' },
    { t: '裸照', w: 50, c: 'strong' },
    { t: '果照', w: 50, c: 'strong' },
    { t: '私密照', w: 50, c: 'strong' },
    { t: '私房照', w: 50, c: 'strong' },
    { t: '私密视频', w: 50, c: 'strong' },
    { t: '福利姬', w: 50, c: 'strong' },
    { t: '福利照', w: 50, c: 'strong' },
    { t: '福利图', w: 50, c: 'strong' },
    { t: '福利视频', w: 50, c: 'strong' },
    { t: '深夜福利', w: 50, c: 'strong' },
    { t: '露点', w: 50, c: 'strong' },
    { t: '走光', w: 50, c: 'strong' },
    { t: '无码', w: 50, c: 'strong' },
    { t: '涩图', w: 50, c: 'strong' },
    { t: '色图', w: 50, c: 'strong' },
    { t: '大保健', w: 50, c: 'strong' },
    { t: '推油', w: 50, c: 'strong' },
    { t: '特殊按摩', w: 50, c: 'strong' },
    { t: '骚货', w: 30, c: 'strong' },
    { t: '骚女', w: 30, c: 'strong' },
    { t: '骚图', w: 50, c: 'strong' },
    { t: '涩女', w: 30, c: 'strong' },
    { t: '私密', w: 20, c: 'strong' },
    { t: '少儿不宜', w: 30, c: 'strong' },
    { t: '你懂的', w: 8, c: 'baitWeak' },
    { t: '懂的都懂', w: 8, c: 'baitWeak' },

    // ---------- contact：联系方式 / 引流 ----------
    // 「微信」单独出现太常见（支付/聊天/公众号），弱信号 10，需叠加；明确引流词（加微信/薇信/私信我）保持 25
    { t: '微信', w: 10, c: 'contact' },
    { t: '微芯', w: 25, c: 'contact' },
    { t: '薇信', w: 25, c: 'contact' },
    { t: '加微', w: 25, c: 'contact' },
    { t: '加微信', w: 25, c: 'contact' },
    { t: '加v', w: 25, c: 'contact' },
    { t: '加V', w: 25, c: 'contact' },
    { t: '加我', w: 10, c: 'contact' },
    { t: '加q', w: 25, c: 'contact' },
    { t: '加Q', w: 25, c: 'contact' },
    { t: '加qq', w: 25, c: 'contact' },
    { t: '加QQ', w: 25, c: 'contact' },
    { t: 'qq号', w: 25, c: 'contact' },
    { t: 'QQ号', w: 25, c: 'contact' },
    { t: '薇我', w: 25, c: 'contact' },
    { t: '微我', w: 25, c: 'contact' },
    { t: 'v我', w: 12, c: 'contact' },
    { t: 'V我', w: 12, c: 'contact' },
    { t: '私聊', w: 12, c: 'contact' },
    { t: '私信', w: 12, c: 'contact' },
    { t: '私信我', w: 25, c: 'contact' },
    { t: '私我', w: 25, c: 'contact' },
    { t: '滴滴我', w: 25, c: 'contact' },
    { t: '戳我', w: 12, c: 'contact' },
    { t: '扣我', w: 25, c: 'contact' },
    { t: '联系我', w: 25, c: 'contact' },
    { t: '联系方式', w: 25, c: 'contact' },
    { t: '找我', w: 8, c: 'contact' },
    { t: '找我聊', w: 25, c: 'contact' },
    { t: '主页有', w: 25, c: 'contact' },
    { t: '看我主页', w: 25, c: 'contact' },
    { t: '点我主页', w: 25, c: 'contact' },
    { t: '来我主页', w: 25, c: 'contact' },
    { t: '我的主页', w: 25, c: 'contact' },
    { t: '简介里有', w: 25, c: 'contact' },
    { t: '简介自取', w: 25, c: 'contact' },
    { t: '主页见', w: 25, c: 'contact' },
    { t: '评论区置顶', w: 25, c: 'contact' },
    { t: '评论区见', w: 25, c: 'contact' },
    { t: '评论区找', w: 25, c: 'contact' },
    { t: 'telegram', w: 25, c: 'contact' },
    { t: 'Telegram', w: 25, c: 'contact' },
    { t: '电报', w: 25, c: 'contact' },
    { t: '纸飞机', w: 25, c: 'contact' },
    { t: '飞机群', w: 25, c: 'contact' },
    { t: 't.me', w: 25, c: 'contact' },
    { t: 'onlyfans', w: 30, c: 'contact' },
    { t: 'OnlyFans', w: 30, c: 'contact' },
    { t: 'fansly', w: 30, c: 'contact' },
    { t: '留邮箱', w: 25, c: 'contact' },
    { t: '留企鹅', w: 25, c: 'contact' },

    // ---------- baitStrong 14：高置信钓鱼话术 ----------
    { t: '玩的开', w: 14, c: 'baitStrong' },
    { t: '玩得开', w: 14, c: 'baitStrong' },
    { t: '玩的开了', w: 14, c: 'baitStrong' },
    { t: '福不黑', w: 14, c: 'baitStrong' },
    { t: '我福不黑', w: 14, c: 'baitStrong' },
    { t: '想看我的', w: 14, c: 'baitStrong' },
    { t: '想不想看', w: 14, c: 'baitStrong' },
    { t: '要不要看', w: 14, c: 'baitStrong' },
    { t: '要看吗', w: 14, c: 'baitStrong' },
    { t: '敢看吗', w: 14, c: 'baitStrong' },
    { t: '你敢看', w: 14, c: 'baitStrong' },
    { t: '私发你', w: 14, c: 'baitStrong' },
    { t: '发你私密', w: 14, c: 'baitStrong' },
    { t: '懂的自然懂', w: 8, c: 'baitWeak' },
    { t: '懂的来', w: 25, c: 'contact' },
    { t: '懂的私', w: 25, c: 'contact' },
    { t: '懂的加', w: 25, c: 'contact' },

    // ---------- baitWeak 8：泛诱导（需叠加） ----------
    { t: '空虚寂寞', w: 8, c: 'baitWeak' },
    { t: '空虚', w: 6, c: 'baitWeak' },
    { t: '有一起的', w: 8, c: 'baitWeak' },
    { t: '一个人', w: 4, c: 'baitWeak' },
    { t: '寂寞难耐', w: 8, c: 'baitWeak' },
    { t: '深夜寂寞', w: 8, c: 'baitWeak' },
    { t: '需要人陪', w: 8, c: 'baitWeak' },
    { t: '想找人陪', w: 8, c: 'baitWeak' },
    { t: '找个人陪', w: 8, c: 'baitWeak' },
    { t: '有人约', w: 8, c: 'baitWeak' },
    { t: '约吗', w: 8, c: 'baitWeak' },
    { t: '约不', w: 8, c: 'baitWeak' },
    { t: '想约', w: 8, c: 'baitWeak' },
    { t: '求约', w: 8, c: 'baitWeak' },
    { t: '来约我', w: 8, c: 'baitWeak' },
    { t: '找我约', w: 8, c: 'baitWeak' },
    { t: '约的来', w: 8, c: 'baitWeak' },
    { t: '约的私', w: 25, c: 'contact' },
    { t: '有兴趣的私', w: 25, c: 'contact' },
    { t: '有兴趣的来', w: 8, c: 'baitWeak' },
    { t: '有没有人要', w: 8, c: 'baitWeak' },
    { t: '想认识一下', w: 8, c: 'baitWeak' },
    { t: '好无聊', w: 4, c: 'baitWeak' },
    { t: '太无聊了', w: 4, c: 'baitWeak' },
    { t: '深夜无聊', w: 8, c: 'baitWeak' },
    { t: '睡不着', w: 4, c: 'baitWeak' },
    { t: '来聊天', w: 8, c: 'baitWeak' },
    { t: '找个人聊天', w: 8, c: 'baitWeak' },
    { t: '有人聊天吗', w: 8, c: 'baitWeak' },
    { t: '免费看', w: 14, c: 'baitStrong' },
    { t: '免费发', w: 14, c: 'baitStrong' },
    { t: '白嫖看', w: 8, c: 'baitWeak' },   // 「白嫖」本身正常，需叠加其他信号
    { t: '关注领', w: 8, c: 'baitWeak' },
    { t: '转发抽', w: 8, c: 'baitWeak' },
    { t: '私信领', w: 25, c: 'contact' },
    { t: '福利', w: 3, c: 'baitWeak' },
  ];

  /** 正则规则。id 用于话题抑制与原因展示 */
  const PATTERNS = [
    { id: 'phone', re: /1[3-9]\d{9}/, w: 40, label: '手机号' },
    // 性服务词 + 价格（只保留强性服务词，去掉「一次/小时/服务/夜」等中性词——
    // 「部署一次收2000」「一小时200」这类正常商务讨论不应命中）
    { id: 'price', re: /(招嫖|包夜|全套|半套|上门|出台|约炮)\S{0,8}\d{2,4}\s*(元|块|rmb|RMB|k|K)?/, w: 40, label: '价格信息' },
    { id: 'tgContact', re: /(?:t\.me\/|telegram|电报|纸飞机|飞机群)[^\s]{0,2}[:：]?\s*@?[a-zA-Z0-9_]{3,}/i, w: 30, label: 'TG联系方式' },
    { id: 'wechatId', re: /(?:vx|wx|weixin|v信|薇信|威信|微信)\s*[:：]?\s*[a-zA-Z0-9_-]{4,20}/i, w: 25, label: '微信号' },
    { id: 'qq', re: /(?:qq|QQ|q\s?q|企鹅|扣扣)\s*[:：]?\s*\d{5,11}/, w: 25, label: 'QQ号' },
    { id: 'adultUrl', re: /(onlyfans|fansly|91porn|xvideos|pornhub|nhentai|e-hentai|jable|avgle|youporn|xnxx|xhamster|coomer|simpcity|f95zone|chaturbate|stripchat|cam4|hanime|javdb|avsox)/i, w: 40, label: '成人链接' },
    { id: 'shortener', re: /(bit\.ly|tinyurl|goo\.gl|cutt\.ly|shorturl|url\.cn|suo\.im|dwz\.cn|t\.cn)\/\w+/i, w: 20, label: '短链' },
    { id: 'wallet', re: /(bc1q[a-z0-9]{25,38}|1[1-9A-HJ-NP-Za-km-z]{25,34}|0x[a-fA-F0-9]{40})/, w: 30, label: '钱包地址' },
    { id: 'url', re: /https?:\/\/\S+/, w: 8, label: '外链' },
    // 擦边自夸/比较句式（不枚举人称，靠句法模式）——权重低，需叠加其他信号才隐藏
    // 比较式：「比她好看的没她骚」「没人比我骚」——countMulti：完整对照句两个比较结构计两分
    { id: 'lewdCmp', re: /(比我|比她|比他|比它|没我|没她|没他|没人|有谁|谁比).{0,4}?(骚|涩)/, w: 12, countMulti: true, label: '比较式擦边' },
    // 程度式：「我太涩了」「她好骚」
    { id: 'lewdDeg', re: /(太|好|真|有点|特别|非常|超级|这么|那么).{0,2}(骚|涩)(了|啊|呢|的|吧)?/, w: 10, label: '程度式擦边' },
    // 宠物玩笑负向（"我家猫太骚了"）
    { id: 'animalLewd', re: /(?:猫|狗|兔|宠物|仓鼠|鸟|鸡|鸭).{0,6}(?:太骚|太涩|好骚|好涩|骚不骚)/, w: -25, label: '宠物玩笑' },
    // 游戏/技术语境负向（"这波操作太骚了""这走位好骚"）
    { id: 'gameLewd', re: /(?:操作|走位|手法|打法|技术|这波|这手|这局|队友|对手|集锦|预判).{0,6}(骚|涩)/, w: -20, label: '游戏/技术语境' },
    // 涩/骚/裸 + 图/照/视频
    { id: 'lewdPhoto', re: /(涩|色|骚|裸|私密).{0,3}(图|照|照片|视频|片子)/, w: 25, label: '涩图/裸照类' },
    // 「福/肤」谐音钓鱼（例：我福不黑 / 锐评我的福）。「我有福气」「看我的皮肤状态」不误伤
    { id: 'fuPun', re: /[福肤](?:不黑|不白|很白|很嫩|照|图|嘛|吗|色)|(?:锐评|评价|评评|评一评|瞅瞅|欣赏).{0,6}[福肤](?<!皮)/, w: 16, label: '"福/肤"谐音钓鱼' },
    // 主页引流（加我主页 / 来主页 / 点主页）
    { id: 'zhuye', re: /(?:加|来|点|进).{0,2}(?:我)?主页/, w: 20, label: '主页引流' },
    // 简介引流（看我简介 / 翻翻我简介）
    { id: 'jianjie', re: /(?:看看|看|翻翻看|翻翻|翻).{0,3}(?:我的|我)?简介/, w: 16, label: '简介引流' },
    // 懂的 + 行动词 = 引流
    { id: 'dongdeAct', re: /懂的(?:来|私|加|联系|滴滴)/, w: 25, label: '懂的来引流' },
    // 微信 与「公众号/支付/充值/支付宝/读书」等连用是正常语境，降权
    { id: 'wechatLegit', re: /微信.{0,4}(?:公众号|读书|支付|运动|步数|登录|扫码|收款|转账|红包|小程序|支付宝|充值|钱包|零钱)/, w: -20, label: '微信正常语境' },
    // 价格 + 元（「300/2小时」）
    { id: 'priceUnit', re: /(?:元|块|rmb|RMB)\s*\/?\s*(?:一?小时|次|晚|夜|h|H)|(?:一小时|一次|一晚|一夜|半天)\s*\d{2,4}\s*(?:元|块)/, w: 25, label: '按次计价' },
  ];

  /** 昵称/账号信号（来自评论区 DOM，只做加分项，封顶 10） */
  const NAME_SIGNALS = [
    { re: /(福利|招嫖|约炮|援交|外围|伴游|裸聊|上门|私密|涩|骚|薇|电报|onlyfans|茶艺|嫩模|空姐|学生妹|车模|模特|主播)/i, w: 6, label: '昵称敏感词' },
    { re: /(520|1314|1314520|521|999|888)/, w: 3, label: '昵称数字串' },
  ];

  /**
   * 昵称硬信号：昵称命中即隐藏该用户全部评论（无歧义强广告词）。
   * 匹配前会先去 emoji/空格（如「催情💊春💊男用💊听话」→「催情春男用听话」命中「催情」）。
   * 有歧义的词（伟哥/情趣/成人/听话等）不放这里，避免误伤「阿伟哥」「情趣相投」这类正常昵称。
   */
  const NAME_HARD_TERMS = [
    // 性药 / 迷药
    '催情', '春药', '听话水', '迷情', '迷药', '失忆水', '乖乖水', '蒙汗药',
    '迷魂', '迷奸', '媚药', '致幻', '增大', '增粗', '助勃', '神油', '金枪不倒',
    '万艾可', '犀利士', '希爱力', '性药', '延时喷剂',
    // 成人用品
    '情趣用品', '情趣内衣', '飞机杯', '震动棒', '跳蛋', '炮机', '硅胶娃娃', '充气娃娃',
    // 招嫖 / 色情服务
    '福利姬', '上门服务', '上门小妹', '上门女', '全套服务', '包夜', '援交',
    '招嫖', '裸聊', '裸照', '果照', '私密照', '约炮', '炮友', '一夜情', '外围',
    '伴游', '楼凤', '莞式', '出台', '卖淫', '坐台',
    // 明确引流
    '加微信', '加微', '薇信', 'vx', 'wx', 'telegram', '电报', 'onlyfans',
  ];

  /** 主页深查（bio）时叠加的规则权重阈值 */
  const PROFILE_RULES = {
    bioHitMinWeight: 25,   // bio 命中 >=25 权重的词 → +15
    adultUrlBonus: 20,     // 主页外链含成人域名 → +20
    shortenerBonus: 10,    // 主页外链为短链 → +10
    newAccountDays: 45,    // 注册 <45 天 → +8
  };

  const DEFAULT_CONFIG = {
    enabled: true,
    mode: 'hide',            // 'hide' 彻底隐藏 | 'dim' 半透明审查模式
    scope: 'comments',       // 'comments' 只管评论区 | 'everywhere' 全站
    thresholds: {
      reply: 14,             // 评论区回复
      feed: 25,              // 信息流（comments 模式）
      feedEverywhere: 16,    // 信息流（everywhere 模式）
    },
    useEmojiNoise: true,
    useProfileCheck: true,
    profileCheckPerMinute: 15,
    whitelist: [],           // 永不过滤的 @handle
    blacklist: [],           // 强制过滤的 @handle
    keywords: {
      explicit: [],
      strong: [],
      contact: [],
      baitStrong: [],
      baitWeak: [],
    },                       // 用户自定义补充关键词（按分类）
  };

  global.XCPO_CONFIG = {
    VERSION,
    KEYWORDS,
    PATTERNS,
    NAME_SIGNALS,
    NAME_HARD_TERMS,
    PROFILE_RULES,
    DEFAULT_CONFIG,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.XCPO_CONFIG;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
