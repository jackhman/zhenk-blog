import {defineConfig} from 'vitepress'
import dataLoader from '../posts/posts.data.js'
import markdownItTitle from 'markdown-it-title'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

markdownItTitle.defaults = {
    level: 0,
    excerpt: 0
}
export default defineConfig({
    title: "Docs",
    description: "个人博客",
    ignoreDeadLinks: true,
    lang: 'zh-CN',
    head: [
        ['link', {rel: 'preconnect', href: 'https://FXWJW2H1XK-dsn.algolia.net', crossorigin: true}],
    ],
    markdown: {
        attrs: {
            disable: true
        },
        defaultHighlightLang: 'html',
        config: (md) => {
            md.use(markdownItTitle);
        }
    },
    vite: {
        plugins: [
            AutoImport({
                resolvers: [ElementPlusResolver()],
            }),
            Components({
                resolvers: [ElementPlusResolver()],
            })
        ],
        ssr: {noExternal: ['element-plus']}
    },
    themeConfig: {
        logo: '/logo/sloth64.png',
        outline: 'deep',
        outlineTitle: '本页大纲',
        lastUpdated: {
            text: '更新于',
            formatOptions: {
                dateStyle: 'full',
                timeStyle: 'medium'
            }
        },
        docFooter: {
            prev: '上一篇',
            next: '下一篇'
        },
        nav: [
            {text: '首页', link: '/'},
            {text: '文章', link: '/posts/'},
            {text: '阅读推荐', link: '/posts/recommend'},
            {
                text: '后端',
                collapsed: true,
                items: [
                    { text: '极客时间', link: '/posts/backEnd/index' }
                ]
            },
			{text: '前端', link: '/posts/frontEnd'},
			{text: '运维', link: '/posts/devops'}
        ],
        sidebar: {
            ...dataLoader.load().sirderBar
        },
        search: {
            //自定义扩展： https://docsearch.algolia.com/docs/legacy/behavior#queryhook
            provider: 'algolia',
            options: {
                appId: 'FXWJW2H1XK',
                apiKey: '7ed21ca5ac0fcda5a3dad33d19c7bec3',
                indexName: 'docs_index',
                maxResultsPerGroup: 30,
                locales: {
                    root: {
                        placeholder: '搜索文章',
                        translations: {
                            button: {
                                buttonText: '搜索文章',
                                buttonAriaLabel: '搜索文章'
                            },
                            modal: {
                                searchBox: {
                                    resetButtonTitle: '清除查询条件',
                                    resetButtonAriaLabel: '清除查询条件',
                                    cancelButtonText: '取消',
                                    cancelButtonAriaLabel: '取消'
                                },
                                startScreen: {
                                    recentSearchesTitle: '搜索历史',
                                    noRecentSearchesText: '没有搜索历史',
                                    saveRecentSearchButtonTitle: '保存至搜索历史',
                                    removeRecentSearchButtonTitle: '从搜索历史中移除',
                                    favoriteSearchesTitle: '收藏',
                                    removeFavoriteSearchButtonTitle: '从收藏中移除'
                                },
                                errorScreen: {
                                    titleText: '无法获取结果',
                                    helpText: '你可能需要检查你的网络连接'
                                },
                                footer: {
                                    selectText: '选择',
                                    navigateText: '切换',
                                    closeText: '关闭',
                                    searchByText: '搜索提供者'
                                },
                                noResultsScreen: {
                                    noResultsText: '无法找到相关结果',
                                    suggestedQueryText: '你可以尝试查询',
                                    reportMissingResultsText: '你认为该查询应该有结果？',
                                    reportMissingResultsLinkText: '点击反馈'
                                }
                            }
                        }
                    }
                }
            }
        }
    }
})
