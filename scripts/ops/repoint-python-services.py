"""One-off (27 Nov 2026): point the PM2 Python services at the renamed scripts, keeping their arguments and settings.

    python3 scripts/ops/repoint-python-services.py           # dry run: prints what would change
    python3 scripts/ops/repoint-python-services.py --apply   # re-registers the services and saves the PM2 list

PM2 cannot change a process's arguments in place, so each service whose arguments still name an old script is deleted and
started again from an ecosystem file with the same name, script, arguments, working folder and service settings (env keys
starting with MEDIA_ or KLASTER_). Services already on the new paths are left alone, so running it twice is harmless.
"""
import json
import os
import subprocess
import sys
import tempfile

RENAMED = {
    "scripts/klaster/layanan_klaster.py": "scripts/clustering/cluster_service.py",
    "scripts/media/layanan_media.py": "scripts/media/media_service.py",
    "scripts/media/layanan_asr.py": "scripts/media/asr_service.py",
}
SETTINGS_PREFIXES = ("MEDIA_", "KLASTER_")


def main():
    apply = "--apply" in sys.argv
    procs = json.loads(subprocess.check_output(["pm2", "jlist"], text=True))
    changed = 0
    for p in procs:
        env = p["pm2_env"]
        args = [str(a) for a in (env.get("args") or [])]
        new_args = list(args)
        for i, a in enumerate(args):
            for old, new in RENAMED.items():
                if a.endswith(old):
                    new_args[i] = a[: -len(old)] + new
        if new_args == args:
            continue
        changed += 1
        settings = {k: v for k, v in (env.get("env") or {}).items() if k.startswith(SETTINGS_PREFIXES)}
        app = {"name": p["name"], "script": env["pm_exec_path"], "args": new_args, "cwd": env.get("pm_cwd"),
               "interpreter": "none", "env": settings}
        print(f"{p['name']}: {' '.join(args)}\n  -> {' '.join(new_args)}\n  settings: {sorted(settings)}")
        missing = [a for a in new_args if a.endswith(".py") and not os.path.exists(a)]
        if missing:
            sys.exit(f"  stop: {missing} does not exist (deploy the code first)")
        if apply:
            with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
                json.dump({"apps": [app]}, f)
            subprocess.check_call(["pm2", "delete", p["name"]], stdout=subprocess.DEVNULL)
            subprocess.check_call(["pm2", "start", f.name], stdout=subprocess.DEVNULL)
            os.unlink(f.name)
            print("  re-registered")
    if apply and changed:
        subprocess.check_call(["pm2", "save"], stdout=subprocess.DEVNULL)
    print(f"{changed} service(s) {'re-registered' if apply else 'to re-register (dry run)'}")


if __name__ == "__main__":
    main()
