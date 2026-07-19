// @ts-check
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import starlight from '@astrojs/starlight';

const nanoidNonSecureCompat = fileURLToPath(new URL('./src/shims/nanoid-non-secure.ts', import.meta.url));

// https://astro.build/config
export default defineConfig({
	site: 'https://gpk.ronktsang.com',
	vite: {
		resolve: {
			alias: {
				'nanoid/non-secure': nanoidNonSecureCompat,
			},
		},
	},
	integrations: [
		starlight({
			components: {
				Hero: './src/components/HomeHero.astro',
				Header: './src/components/WebsiteHeader.astro',
			},
			title: {
				en: 'Gemini Power Kit',
				'zh-CN': 'Gemini Power Kit',
			},
			logo: {
				src: './src/assets/icon-512.png',
			},
			favicon: '/favicon.png',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/RonkTsang/gemini-chat-extension' },
			],
			customCss: [
				'./src/styles/custom.css',
			],
			defaultLocale: 'root',
			locales: {
				root: {
					label: 'English',
					lang: 'en',
				},
				'zh-cn': {
					label: '中文',
					lang: 'zh-CN',
				},
			},
			sidebar: [
				{
					label: 'Guide',
					translations: { 'zh-CN': '指南' },
					items: [
						{ label: 'Install', translations: { 'zh-CN': '安装' }, slug: 'guide/install' },
						{ label: 'Quick Start', translations: { 'zh-CN': '快速开始' }, slug: 'guide/quick-start' },
					],
				},
				{
					label: 'Features',
					translations: { 'zh-CN': '功能特性' },
					items: [
						{ label: 'Chat Outline', translations: { 'zh-CN': '对话大纲' }, slug: 'features/chat-outline' },
						{ label: 'Quick Follow-up', translations: { 'zh-CN': '快速跟进' }, slug: 'features/quick-follow-up' },
						{ label: 'Chain Prompt', translations: { 'zh-CN': '链式提示词' }, slug: 'features/chain-prompt' },
						{ label: 'Open in New Tab', translations: { 'zh-CN': '新标签页打开' }, slug: 'features/stuff-open-new-tab' },
						{ label: 'Tab Title Sync', translations: { 'zh-CN': '标签页标题同步' }, slug: 'features/tab-title-sync' },
						{ label: 'Keyboard Shortcuts', translations: { 'zh-CN': '快捷键' }, slug: 'features/shortcuts' },
						{ label: 'Notifications', translations: { 'zh-CN': '回复完成通知' }, slug: 'features/notifications' },
						{ label: 'Bulk Delete', translations: { 'zh-CN': '批量删除' }, slug: 'features/bulk-delete' },
						{ label: 'Theme', translations: { 'zh-CN': '主题个性化' }, slug: 'features/theme' },
					],
				},
				{
					label: 'Support',
					translations: { 'zh-CN': '支持' },
					items: [
						{ label: 'FAQ', translations: { 'zh-CN': '常见问题' }, slug: 'support/faq' },
						{ label: 'Notification Troubleshooting', translations: { 'zh-CN': '通知问题排查' }, slug: 'support/notification-troubleshooting' },
						{ label: "What's New", translations: { 'zh-CN': '最新动态' }, slug: 'support/whats-new' },
						{ label: 'Privacy Policy', translations: { 'zh-CN': '隐私政策' }, slug: 'privacy-policy' },
					],
				},

			],
		}),
	],
});
