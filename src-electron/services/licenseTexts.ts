import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isKnownSpdxLicense, licenseLabel } from '../../src/models/licenses';

const FALLBACK: Record<string, string> = {
  'CC-BY-SA-4.0': `Creative Commons Attribution-ShareAlike 4.0 International (CC-BY-SA-4.0)

You are free to share and adapt this work, even commercially, provided you
give appropriate credit, indicate if changes were made, and distribute your
contributions under the same license.

Full legal text:
https://creativecommons.org/licenses/by-sa/4.0/legalcode
`,
  'CC-BY-4.0': `Creative Commons Attribution 4.0 International (CC-BY-4.0)

You are free to share and adapt this work, even commercially, provided you
give appropriate credit and indicate if changes were made.

Full legal text:
https://creativecommons.org/licenses/by/4.0/legalcode
`,
  'CC0-1.0': `Creative Commons Zero 1.0 Universal (CC0-1.0)

The author(s) have dedicated this work to the public domain by waiving all
of their rights to the work worldwide under copyright law, including all
related and neighboring rights, to the extent allowed by law.

Full legal text:
https://creativecommons.org/publicdomain/zero/1.0/legalcode
`,
  'CC-BY-NC-SA-4.0': `Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
(CC-BY-NC-SA-4.0)

You are free to share and adapt this work for non-commercial purposes,
provided you give appropriate credit, indicate if changes were made, and
distribute your contributions under the same license.

Full legal text:
https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode
`,
  MIT: `MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

https://opensource.org/licenses/MIT
`,
  'Apache-2.0': `Apache License 2.0

Licensed under the Apache License, Version 2.0 (the "License"); you may not
use this file except in compliance with the License. You may obtain a copy of
the License at:

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
License for the specific language governing permissions and limitations under
the License.

Full legal text:
https://www.apache.org/licenses/LICENSE-2.0
`,
};

function assetsLicensesDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, '../assets/licenses');
}

/** Resolve short license text for packing into a .tune archive. */
export function resolveLicenseText(spdxId: string): string {
  const id = spdxId.trim();
  if (!id) {
    return 'No license specified.\n';
  }

  if (isKnownSpdxLicense(id)) {
    const file = path.join(assetsLicensesDir(), `${id}.txt`);
    try {
      if (fs.existsSync(file)) {
        return fs.readFileSync(file, 'utf8');
      }
    } catch {
      /* fall through */
    }
    return FALLBACK[id] ?? `${licenseLabel(id)}\n\nSPDX: ${id}\n`;
  }

  return `Custom license identifier: ${id}\n\nSee the rights metadata in song.json for holder and notice fields.\n`;
}
