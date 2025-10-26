import { nodeResolve } from "@rollup/plugin-node-resolve";
import copy from "rollup-plugin-copy";

export default {
	input: {
		background: "src/background.js",
		content: "src/content.js",
		sidebar: "src/sidebar.js",
		settings: "src/settings.js",
	},
	output: {
		dir: "dist",
		format: "es",
		sourcemap: true,
	},
	plugins: [
		nodeResolve(),
		copy({
			targets: [
				{ src: "src/manifest.json", dest: "dist" },
				{ src: "src/sidebar.html", dest: "dist" },
				{ src: "src/sidebar.css", dest: "dist" },
				{ src: "src/settings.html", dest: "dist" },
			],
		}),
	],
};
