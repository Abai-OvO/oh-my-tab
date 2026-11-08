export type CommonSiteCategory =
  "search" | "social" | "video" | "dev" | "ai" | "read" | "shop" | "tool"

export type CommonSite = {
  id: string
  labelKey: string
  url: string
  // Static badge colors keep the preset row offline: favicons would request
  // icons for sites the user has not added yet.
  color: string
  initial: string
  category: CommonSiteCategory
  hot?: boolean
}

export const commonSiteCategories = [
  "all",
  "hot",
  "search",
  "social",
  "video",
  "dev",
  "ai",
  "read",
  "shop",
  "tool",
] as const

export type CommonSiteFilter = (typeof commonSiteCategories)[number]

// Presets only fill the tab editor form; nothing is saved until the user
// confirms the new tab.
export const commonSites: readonly CommonSite[] = [
  {
    id: "baidu",
    labelKey: "grid.quickAdd.sites.baidu",
    url: "https://www.baidu.com/",
    color: "#2932e1",
    initial: "百",
    category: "search",
    hot: true,
  },
  {
    id: "google",
    labelKey: "grid.quickAdd.sites.google",
    url: "https://www.google.com/",
    color: "#4285f4",
    initial: "G",
    category: "search",
  },
  {
    id: "bing",
    labelKey: "grid.quickAdd.sites.bing",
    url: "https://www.bing.com/",
    color: "#008373",
    initial: "B",
    category: "search",
  },
  {
    id: "sogou",
    labelKey: "grid.quickAdd.sites.sogou",
    url: "https://www.sogou.com/",
    color: "#ff6a00",
    initial: "搜",
    category: "search",
  },
  {
    id: "weibo",
    labelKey: "grid.quickAdd.sites.weibo",
    url: "https://weibo.com/",
    color: "#e6162d",
    initial: "微",
    category: "social",
  },
  {
    id: "zhihu",
    labelKey: "grid.quickAdd.sites.zhihu",
    url: "https://www.zhihu.com/",
    color: "#0066ff",
    initial: "知",
    category: "social",
    hot: true,
  },
  {
    id: "xiaohongshu",
    labelKey: "grid.quickAdd.sites.xiaohongshu",
    url: "https://www.xiaohongshu.com/",
    color: "#ff2442",
    initial: "红",
    category: "social",
  },
  {
    id: "douban",
    labelKey: "grid.quickAdd.sites.douban",
    url: "https://www.douban.com/",
    color: "#2e963d",
    initial: "豆",
    category: "social",
  },
  {
    id: "bilibili",
    labelKey: "grid.quickAdd.sites.bilibili",
    url: "https://www.bilibili.com/",
    color: "#fb7299",
    initial: "B",
    category: "video",
    hot: true,
  },
  {
    id: "youtube",
    labelKey: "grid.quickAdd.sites.youtube",
    url: "https://www.youtube.com/",
    color: "#ff0000",
    initial: "Y",
    category: "video",
  },
  {
    id: "tencentVideo",
    labelKey: "grid.quickAdd.sites.tencentVideo",
    url: "https://v.qq.com/",
    color: "#ff7f00",
    initial: "腾",
    category: "video",
  },
  {
    id: "neteaseMusic",
    labelKey: "grid.quickAdd.sites.neteaseMusic",
    url: "https://music.163.com/",
    color: "#c20c0c",
    initial: "网",
    category: "video",
  },
  {
    id: "github",
    labelKey: "grid.quickAdd.sites.github",
    url: "https://github.com/",
    color: "#24292f",
    initial: "G",
    category: "dev",
    hot: true,
  },
  {
    id: "mdn",
    labelKey: "grid.quickAdd.sites.mdn",
    url: "https://developer.mozilla.org/",
    color: "#1b1b1f",
    initial: "M",
    category: "dev",
  },
  {
    id: "stackoverflow",
    labelKey: "grid.quickAdd.sites.stackoverflow",
    url: "https://stackoverflow.com/",
    color: "#f48024",
    initial: "S",
    category: "dev",
  },
  {
    id: "vercel",
    labelKey: "grid.quickAdd.sites.vercel",
    url: "https://vercel.com/",
    color: "#111111",
    initial: "V",
    category: "dev",
  },
  {
    id: "chatgpt",
    labelKey: "grid.quickAdd.sites.chatgpt",
    url: "https://chatgpt.com/",
    color: "#10a37f",
    initial: "C",
    category: "ai",
    hot: true,
  },
  {
    id: "claude",
    labelKey: "grid.quickAdd.sites.claude",
    url: "https://claude.ai/",
    color: "#d97757",
    initial: "C",
    category: "ai",
  },
  {
    id: "gemini",
    labelKey: "grid.quickAdd.sites.gemini",
    url: "https://gemini.google.com/",
    color: "#4a8cf7",
    initial: "G",
    category: "ai",
  },
  {
    id: "sspai",
    labelKey: "grid.quickAdd.sites.sspai",
    url: "https://sspai.com/",
    color: "#d81e06",
    initial: "少",
    category: "read",
  },
  {
    id: "jike",
    labelKey: "grid.quickAdd.sites.jike",
    url: "https://web.okjike.com/",
    color: "#c99700",
    initial: "即",
    category: "read",
  },
  {
    id: "wikipedia",
    labelKey: "grid.quickAdd.sites.wikipedia",
    url: "https://www.wikipedia.org/",
    color: "#636466",
    initial: "W",
    category: "read",
  },
  {
    id: "taobao",
    labelKey: "grid.quickAdd.sites.taobao",
    url: "https://www.taobao.com/",
    color: "#ff5000",
    initial: "淘",
    category: "shop",
    hot: true,
  },
  {
    id: "jd",
    labelKey: "grid.quickAdd.sites.jd",
    url: "https://www.jd.com/",
    color: "#e1251b",
    initial: "京",
    category: "shop",
  },
  {
    id: "figma",
    labelKey: "grid.quickAdd.sites.figma",
    url: "https://www.figma.com/",
    color: "#a259ff",
    initial: "F",
    category: "tool",
  },
  {
    id: "notion",
    labelKey: "grid.quickAdd.sites.notion",
    url: "https://www.notion.so/",
    color: "#1f1f1f",
    initial: "N",
    category: "tool",
  },
]
