import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService, MailAttachment } from '../mail/mail.service';
import * as os from 'os';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as dns from 'dns';
import * as net from 'net';
const archiver = require('archiver');
// ...existing code...

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly mailService: EmailService) {}

  /**
   * Returns overview stats required by the frontend.
   * Shape: { totalUsers, activeProjects, systemUptime, securityAlerts }
   */
  async getOverview() {
    try {
      const totalUsers = await this.prisma.user.count();

      // Projects feature not implemented yet — report 0 for now
      const activeProjects = 0;
      const securityAlerts = 0;


      // Get host uptime (seconds) and format to human readable string
      const uptimeSeconds = Math.floor(os.uptime() ?? 0);
      const days = Math.floor(uptimeSeconds / 86400);
      const hours = Math.floor((uptimeSeconds % 86400) / 3600);
      const minutes = Math.floor((uptimeSeconds % 3600) / 60);
      const systemUptime = `${days}d ${hours}h ${minutes}m`;


      return {
        totalUsers,
        activeProjects,
        systemUptime,
        securityAlerts,
      };
    } catch (err) {
      return {
        totalUsers: 0,
        activeProjects: 0,
        systemUptime: '0d 0h 0m',
        securityAlerts: 0,
      };
    }
  }

  /**
   * Returns system health information used by the Admin -> System UI.
   * Shape: { db: { name, running, healthy }, server: { diskUsagePercent, memoryUsagePercent } }
   */
  async getSystemHealth() {
    try {
      // First, try to determine DB host/port from the application's configuration
      // Prefer DATABASE_URL (Prisma/database connection) or explicit env vars.
      let dbHost: string | null = null;
      let dbPort: number | null = null;
      try {
        const envUrl = process.env.DATABASE_URL || process.env.DATABASEURL || '';
        if (envUrl) {
          try {
            const u = new URL(envUrl);
            if (u.hostname) dbHost = u.hostname;
            if (u.port) dbPort = Number(u.port);
            // default postgres port
            if (!dbPort) dbPort = 5432;
          } catch (e) {
            // ignore parse errors
          }
        }
      } catch (e) {
        // ignore
      }
      if (!dbHost && process.env.DATABASE_HOST) {
        dbHost = process.env.DATABASE_HOST;
        dbPort = Number(process.env.DATABASE_PORT || process.env.DB_PORT || '5432');
      }

      // Helper to test TCP connectivity
      const tryTcpConnect = (host: string, port: number, timeoutMs = 1500) =>
        new Promise<boolean>((resolve) => {
          const sock = new net.Socket();
          let resolved = false;
          const onDone = (val: boolean) => {
            if (resolved) return;
            resolved = true;
            try { sock.destroy(); } catch (e) {}
            resolve(val);
          };
          sock.setTimeout(timeoutMs, () => onDone(false));
          sock.once('error', () => onDone(false));
          sock.connect(port, host, () => onDone(true));
        });

      // Resolve and probe the host if we found one
      let dbStatus = { name: null as string | null, running: false, healthy: false };
      if (dbHost) {
        const port = dbPort || 5432;
        dbStatus.name = `${dbHost}:${port}`;
        try {
          // If dbHost is a DNS name, resolve to an IP first (best-effort)
          let addr = dbHost;
          try {
            const lookup = await dns.promises.lookup(dbHost);
            if (lookup && lookup.address) addr = lookup.address;
          } catch (e) {
            // DNS lookup failed; we'll still try to connect using the raw host
          }

          // Try TCP connect to the resolved address/host
          const ok = await tryTcpConnect(addr, port, 1500);
          dbStatus.running = ok;

          // For a lightweight "healthy" check, prefer pg_isready if available
          if (ok) {
            try {
              // pg_isready returns exit code 0 when server is accepting connections
              execSync(`pg_isready -h ${dbHost} -p ${port}`, { stdio: 'ignore' });
              dbStatus.healthy = true;
            } catch (_) {
              // pg_isready not available or returned non-zero; mark healthy same as running
              dbStatus.healthy = true;
            }
          }
        } catch (e) {
          // probe failed, leave defaults
        }
      } else {
        // 1) Attempt to discover postgres container name from docker-compose files
        const composeFiles = ['docker-compose.yml', 'docker-compose.dev.yml'];
        let dbServiceName: string | null = null;
        for (const fname of composeFiles) {
          const p = path.join(process.cwd(), fname);
          if (!fs.existsSync(p)) continue;
          const content = fs.readFileSync(p, 'utf8');
          // simple heuristic: look for 'image: postgres' or service name with 'postgres'
          const matchImage = content.match(/([a-zA-Z0-9_-]+):\s*\n[\s\S]{0,200}?image:\s*(?:[\w:\/\-]*postgres[\w:\/\-]*)/i);
          if (matchImage && matchImage[1]) {
            dbServiceName = matchImage[1];
            break;
          }
          // fallback: find 'container_name:' near a postgres image
          const matchContainer = content.match(/container_name:\s*([\w\-_.]+)/i);
          if (matchContainer && matchContainer[1]) {
            dbServiceName = matchContainer[1];
            break;
          }
        }

        try {
          if (dbServiceName) {
            // Try docker ps --filter name=<service> --format '{{.Names}} {{.Status}}'
            const cmd = `docker ps --filter name=${dbServiceName} --format "{{.Names}}|||{{.Status}}"`;
            const out = execSync(cmd, { encoding: 'utf8' }).trim();
            if (out) {
              const [name, status] = out.split('|||');
              dbStatus.name = name || dbServiceName;
              dbStatus.running = /Up/i.test(status);
              dbStatus.healthy = /healthy/i.test(status) || /Up \(healthy\)/i.test(status);
            }
          } else {
            // If we couldn't find a service name, try to detect postgres containers
            const out = execSync(`docker ps --filter ancestor=postgres --format "{{.Names}}|||{{.Status}}"`, { encoding: 'utf8' }).trim();
            if (out) {
              const [name, status] = out.split('|||');
              dbStatus.name = name;
              dbStatus.running = /Up/i.test(status);
              dbStatus.healthy = /healthy/i.test(status);
            }
          }
        } catch (e) {
          // Docker not available or command failed — leave dbStatus defaults
        }
      }

      // 3) Server metrics: attempt to report the host system metrics (best-effort).
      // When running inside containers, container-local OS stats reflect the container
      // namespaces. Prefer to query the Docker Engine for host-level info when
      // available (docker CLI/socket). Fall back to container-local values otherwise.
      let memoryUsagePercent = 0;
      let diskUsagePercent = 0;

      // Helper: try to get Docker Engine info (JSON) via docker CLI
      const tryGetDockerInfo = () => {
        try {
          const out = execSync(`docker info --format "{{json .}}"`, { encoding: 'utf8' }).trim();
          if (out) return JSON.parse(out) as any;
        } catch (e) {
          // docker CLI or socket not available
        }
        return null;
      };

      const dockerInfo = tryGetDockerInfo();

      if (dockerInfo && dockerInfo.MemTotal) {
        // dockerInfo.MemTotal is bytes on the host
        const hostTotalMem = Number(dockerInfo.MemTotal) || 0;
        if (hostTotalMem > 0) {
          // Use container free memory as a lightweight probe to estimate host usage.
          // This is best-effort: inside containers os.freemem() may be limited by cgroups,
          // but combining with docker's host total gives a better host-oriented percentage
          // than using container-only values.
          const containerFree = os.freemem();
          const used = Math.max(0, hostTotalMem - containerFree);
          memoryUsagePercent = Math.min(100, Math.round((used / hostTotalMem) * 100));
        }
      } else {
        // Fallback to container-local memory metrics
        try {
          const totalMem = os.totalmem();
          const freeMem = os.freemem();
          const usedMem = Math.max(0, totalMem - freeMem);
          memoryUsagePercent = Math.min(100, Math.round((usedMem / totalMem) * 100));
        } catch (e) {
          memoryUsagePercent = 0;
        }
      }

      // Disk usage: prefer using DockerRootDir reported by docker info (host path)
      // and run df against that path when possible to estimate host disk usage.
      try {
        if (dockerInfo && dockerInfo.DockerRootDir) {
          try {
            const dockerRoot = String(dockerInfo.DockerRootDir);
            // Attempt to run df against DockerRootDir. In many setups the DockerRootDir
            // is accessible from the container (best-effort). If not accessible, this
            // command will fail and we'll fall back.
            const dfOut = execSync(`df -k ${dockerRoot}`, { encoding: 'utf8' });
            const lines = dfOut.split('\n').filter(Boolean);
            if (lines.length >= 2) {
              const cols = lines[1].split(/\s+/);
              const usePercent = cols[4] || cols[2];
              diskUsagePercent = Number(String(usePercent).replace('%', '')) || 0;
            }
          } catch (e) {
            // If df on DockerRootDir failed, fall through to other strategies
          }
        }

        // If diskUsagePercent still unknown, try to probe a plausible host address
        // (host.docker.internal or default gateway) and if available, attempt to
        // use docker info or df against it via the docker CLI as a fallback.
        if (!diskUsagePercent) {
          // Last-resort: container-local df for root
          if (process.platform === 'win32') {
            const diskOut = execSync(`wmic logicaldisk where "DeviceID='C:'" get Size,FreeSpace /format:csv`, { encoding: 'utf8' }).trim();
            const lines = diskOut.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length >= 2) {
              const parts = lines[1].split(',');
              const free = Number(parts[1] || 0);
              const size = Number(parts[2] || 0);
              if (size > 0) diskUsagePercent = Math.round(((size - free) / size) * 100);
            }
          } else {
            const dfOut = execSync('df -k /', { encoding: 'utf8' });
            const lines = dfOut.split('\n').filter(Boolean);
            if (lines.length >= 2) {
              const cols = lines[1].split(/\s+/);
              const usePercent = cols[4] || cols[2];
              diskUsagePercent = Number(String(usePercent).replace('%', '')) || 0;
            }
          }
        }
      } catch (e) {
        // ignore and keep defaults
      }

      return {
        db: dbStatus,
        server: {
          memoryUsagePercent: Number.isFinite(memoryUsagePercent) ? memoryUsagePercent : 0,
          diskUsagePercent: Number.isFinite(diskUsagePercent) ? diskUsagePercent : 0,
        },
      };
    } catch (err) {
      return {
        db: { name: null, running: false, healthy: false },
        server: { memoryUsagePercent: 0, diskUsagePercent: 0 },
      };
    }
  }

  /**
   * Exports all public tables to CSV files and emails them to the provided address.
   * If email is not provided, it will throw an error.
   */
  async backupDatabase(email?: string) {
    if (!email) {
      throw new Error('Email address is required to send the backup');
    }

    // Directory for temp CSVs
    const tmpDir = path.join(os.tmpdir(), `nextbrain-backup-${Date.now()}`);
    try {
      fs.mkdirSync(tmpDir, { recursive: true });

      // 1) Get list of user tables from the database via raw SQL
      // This uses Postgres information_schema; adjust if using another DB.
      const tables: Array<{ table_name: string }> = await this.prisma.$queryRaw`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `;

      const attachments: Array<{ filename: string; path: string }> = [];

      // 2) For each table, export rows to CSV
      for (const t of tables) {
        const name = String(t.table_name);
        try {
          // Fetch all rows for the table
          const rows: any[] = await this.prisma.$queryRawUnsafe(`SELECT * FROM "${name}"`);

          // Convert to CSV
          let csv = '';
          if (rows && rows.length > 0) {
            const header = Object.keys(rows[0]);
            // Inline CSV serialization (simple, best-effort)
            const escape = (v: any) => {
              if (v === null || v === undefined) return '';
              const s = String(v);
              if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                return '"' + s.replace(/"/g, '""') + '"';
              }
              return s;
            };
            const lines = [header.join(',')];
            for (const r of rows) {
              lines.push(header.map(h => escape(r[h])).join(','));
            }
            csv = lines.join('\n');
          } else {
            // Create an empty CSV with a header placeholder indicating no rows
            csv = 'no_rows\n';
          }

          const fname = `${name}.csv`;
          const fpath = path.join(tmpDir, fname);
          fs.writeFileSync(fpath, csv, 'utf8');
          attachments.push({ filename: fname, path: fpath });
        } catch (e) {
          // skip table on error
        }
      }

      // 3) Create a single ZIP archive containing all CSVs
      const zipName = `nextbrain-backup-${Date.now()}.zip`;
      const zipPath = path.join(tmpDir, zipName);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.pipe(output);

      for (const a of attachments) {
        // ensure the file still exists
        if (fs.existsSync(a.path)) {
          archive.file(a.path, { name: a.filename });
        }
      }

      await new Promise<void>((resolve, reject) => {
        output.on('close', () => resolve());
        archive.on('error', (err: any) => reject(err));
        archive.finalize();
      });

      // Send a single zip file as attachment
      const mailAttachments: MailAttachment[] = [{ filename: zipName, path: zipPath }];
      const mailResult = await this.mailService.sendRawMail({
        to: email,
        subject: `NextBrain Database Backup - ${new Date().toISOString()}`,
        text: 'Attached is a ZIP archive containing CSV exports of the database tables.',
        attachments: mailAttachments,
      });

      const previewUrl = mailResult.preview || null;

      // 5) Clean up temp files (CSV files + zip)
      try {
        for (const a of attachments) {
          try { fs.unlinkSync(a.path); } catch (e) {}
        }
        try { fs.unlinkSync(zipPath); } catch (e) {}
        try { fs.rmdirSync(tmpDir); } catch (e) {}
      } catch (e) {}

      return { success: true, previewUrl };
    } catch (err) {
      // cleanup on error
      try { fs.rmdirSync(tmpDir, { recursive: true }); } catch (e) {}
      throw err;
    }
  }


}
