module.exports = function(grunt){

	var banner = "";
	banner += '/* Bonfires v<%= pkg.version %> | ';
	banner += '(c) <%= grunt.template.today("yyyy") %> Travis Wimer - ';
	banner += 'http://traviswimer.com | ';
	banner += 'Released under the MIT license */\n';

	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		uglify: {
			options: {
				banner: banner
			},
			build: {
				src: 'bonfire.js',
				dest: 'minified/<%= pkg.name %>-<%= pkg.version %>.min.js'
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-uglify');

	grunt.registerTask('default', ['uglify']);

};