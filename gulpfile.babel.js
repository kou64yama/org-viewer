import gulp from 'gulp';
import gulpLoadPlugins from 'gulp-load-plugins';
import watchify from 'watchify';
import browserify from 'browserify';
import babelify from 'babelify';
import source from 'vinyl-source-stream';
import buffer from 'vinyl-buffer';
import merge from 'merge2';
import del from 'del';
import assign from 'lodash.assign';

const $ = gulpLoadPlugins();
const reload = $.livereload.reload;

function build(entries, dest, options) {
  dest = dest.split('/');
  options = assign({}, options, {
    entries: entries,
    debug: true
  });

  var bundler;
  if (options.watch) {
    options = assign({}, watchify.args, options);
    bundler = watchify(browserify(options)).transform(babelify);
  } else {
    bundler = browserify(options).transform(babelify);
  }

  const filename = dest.pop();
  const dir = dest.join('/');

  function bundle() {
    return bundler.bundle()
      .on('error', $.util.log.bind($.util, 'Browserify Error'))
      .pipe(source(filename))
      .pipe(buffer())
      .pipe(gulp.dest(dir));
  }

  bundler.on('update', bundle);
  bundler.on('log', $.util.log);
  return bundle;
}

gulp.task('scripts', () => {
  return merge([
    build(['app/scripts.babel/injected.js'], 'app/scripts/injected.js')(),
    build(['app/scripts.babel/chromereload.js'], 'app/scripts/chromereload.js')()
  ]);
});

gulp.task('styles', () => {
  return gulp.src('app/styles.stylus/**/*.styl')
    .pipe($.sourcemaps.init())
    .pipe($.stylus())
    .pipe($.sourcemaps.write())
    .pipe(gulp.dest('app/styles'));
});

gulp.task('watch', ['scripts', 'styles'], () => {
  $.livereload.listen();

  gulp.watch([
    'app/**/*',
    '!app/{scripts.babel,styles.stylus}/**/*'
  ]).on('change', reload);

  build(['app/scripts.babel/injected.js'], 'app/scripts/injected.js', {watch: true})();
  build(['app/scripts.babel/chromereload.js'], 'app/scripts/chromereload.js', {watch: true})();

  gulp.watch('app/styles.stylus/**/*.styl', ['styles']);
});

gulp.task('images', () => {
  return gulp.src('app/images/**/*')
    .pipe($.if($.if.isFile, $.cache($.imagemin({
      progressive: true,
      interlaced: true,
      svgoPlugins: [{cleanupIDs: false}]
    }))))
    .on('error', function(err) {
      $.util.log(err);
      this.end();
    })
    .pipe(gulp.dest('dist/images'));
});

gulp.task('extras', () => {
  return gulp.src([
    'app/*.*',
    'app/**/*.json',
    '!app/{styles.stylus,scripts.babel}'
  ], {
    dot: true
  }).pipe(gulp.dest('dist'));
});

gulp.task('manifest', () => {
  return gulp.src('app/manifest.json')
    .pipe($.chromeManifest({
      background: {
        target: 'scripts/background.js',
        exclude: ['scripts/chromereload.js']
      }
    }))
    .pipe($.if('*.json', $.jsonminify()))
    .pipe($.if('*.js', $.uglify()))
    .pipe($.if('*.css', $.minifyCss({compatibility: '*'})))
    .pipe(gulp.dest('dist'));
});

gulp.task('clean', del.bind(null, ['.tmp', 'dist']));

gulp.task('build', ['styles', 'scripts', 'images', 'manifest', 'extras'], () => {
  return gulp.src('dist/**/*').pipe($.size({title: 'build'}));
});

gulp.task('default', ['clean'], () => {
  gulp.start('build');
});
