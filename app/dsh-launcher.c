// Native macOS entry point for DSH.app.
//
// LaunchServices executes a shell-script CFBundleExecutable through
// Terminal.app. This small Mach-O wrapper keeps the app bundle's executable
// native and invokes the existing launcher script as a child process instead.
// The child inherits the GUI environment and has no Terminal/TTY attached.

#include <errno.h>
#include <limits.h>
#include <mach-o/dyld.h>
#include <spawn.h>
#include <stdio.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

extern char **environ;

static int executable_path(char *buffer, uint32_t *size) {
  if (_NSGetExecutablePath(buffer, size) != 0) {
    fprintf(stderr, "dsh-launcher: executable path is too long\n");
    return -1;
  }
  return 0;
}

int main(void) {
  char executable[PATH_MAX];
  uint32_t executable_size = (uint32_t)sizeof(executable);
  if (executable_path(executable, &executable_size) != 0) return 70;

  // The native executable lives in Contents/MacOS; the script lives in
  // Contents/Resources so that it is never interpreted as the app executable.
  char *last_slash = strrchr(executable, '/');
  if (last_slash == NULL) {
    fprintf(stderr, "dsh-launcher: executable path has no parent directory\n");
    return 70;
  }
  *last_slash = '\0';

  char script[PATH_MAX];
  int written = snprintf(script, sizeof(script), "%s/../Resources/dsh-launcher.sh", executable);
  if (written < 0 || (size_t)written >= sizeof(script)) {
    fprintf(stderr, "dsh-launcher: resource path is too long\n");
    return 70;
  }

  char *const arguments[] = {"/bin/bash", script, NULL};
  pid_t child = 0;
  int spawn_status = posix_spawn(&child, "/bin/bash", NULL, NULL, arguments, environ);
  if (spawn_status != 0) {
    fprintf(stderr, "dsh-launcher: could not start launcher script (%d)\n", spawn_status);
    return 70;
  }

  int status = 0;
  while (waitpid(child, &status, 0) < 0) {
    if (errno == EINTR) continue;
    perror("dsh-launcher: waitpid");
    return 70;
  }
  if (WIFEXITED(status)) return WEXITSTATUS(status);
  if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
  return 70;
}
