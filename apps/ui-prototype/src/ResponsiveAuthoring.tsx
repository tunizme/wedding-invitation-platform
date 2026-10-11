import { useState } from 'react';
import type {
  TemplateDesignV2,
  SectionRule,
} from '../../web/src/features/invitation-builder/document/types';
import { validateSupportedTemplateDesign } from '../../web/src/features/invitation-builder/document/schema';
import { usePrototype } from './App';
import { templates } from './fixtures';
import { Button, Dialog, Field, LivePreview, Notice, SelectField } from './ui';

export function ResponsiveAuthoring({
  id,
  initial,
}: {
  id: string;
  initial: TemplateDesignV2;
}) {
  const { catalog, setCatalog, setDesigns, navigate, scenario, toast } =
    usePrototype();
  const template = catalog.find((t) => t.id === id) ?? templates[0];
  const [design, setDesign] = useState(() => structuredClone(initial));
  const [history, setHistory] = useState<TemplateDesignV2[]>([]);
  const [selected, setSelected] = useState(initial.sectionOrder[0]);
  const [width, setWidth] = useState<390 | 900>(900);
  const [name, setName] = useState(template.name);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [publish, setPublish] = useState(false);
  const section = design.sections[selected];
  function update(rule: Partial<SectionRule>, device: 'mobile' | 'desktop') {
    setHistory((all) => [...all, design]);
    const next = structuredClone(design);
    if (device === 'mobile')
      next.sections[selected].mobile = {
        ...next.sections[selected].mobile,
        ...rule,
      };
    else
      next.sections[selected].desktop = {
        ...next.sections[selected].desktop,
        ...rule,
      };
    setDesign(next);
    setSaved(false);
  }
  function save() {
    if (scenario === 'error' || scenario === 'conflict') {
      setError('Chưa thể lưu mẫu. Bản thiết kế vừa chỉnh vẫn được giữ.');
      return false;
    }
    const validation = validateSupportedTemplateDesign(design);
    if (!validation.valid) {
      setError('Bố cục chưa hợp lệ. Kiểm tra thuộc tính các phần.');
      return false;
    }
    setDesigns((all) => ({ ...all, [id]: structuredClone(design) }));
    setCatalog((all) => all.map((t) => (t.id === id ? { ...t, name } : t)));
    setError('');
    setSaved(true);
    toast('Đã lưu mẫu minh họa');
    return true;
  }
  return (
    <main className="workspace admin-workspace" tabIndex={-1}>
      <header className="workspace-toolbar">
        <Button variant="ghost" onClick={() => navigate('/admin/templates')}>
          Về quản lý mẫu
        </Button>
        <h1 tabIndex={-1}>{template.name}</h1>
        <span className="muted small">Admin Authoring · Sections</span>
        <Button
          variant="secondary"
          disabled={!history.length}
          onClick={() => {
            setDesign(history.at(-1)!);
            setHistory(history.slice(0, -1));
            setSaved(false);
          }}
        >
          Hoàn tác
        </Button>
        <Button variant="secondary" onClick={save}>
          {saved ? 'Đã lưu' : 'Lưu mẫu'}
        </Button>
        <Button
          onClick={() => {
            if (save()) setPublish(true);
          }}
        >
          Xuất bản mẫu
        </Button>
      </header>
      <div className="authoring-layout">
        <aside className="authoring-panel">
          <h2>Các phần của thiệp</h2>
          <p className="muted small">
            Thiết kế mobile và desktop dùng chung nội dung. Chỉ Admin chỉnh bố
            cục.
          </p>
          <div className="layer-list">
            {design.sectionOrder.map((sid, i) => (
              <button
                key={sid}
                aria-pressed={selected === sid}
                onClick={() => setSelected(sid)}
              >
                <span>{String(i + 1).padStart(2, '0')}</span>
                {design.sections[sid].label}
              </button>
            ))}
          </div>
          <Field
            id="responsive-name"
            label="Tên mẫu"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
          />
          <h3>{section.label}</h3>
          {(['mobile', 'desktop'] as const).map((device) => {
            const rule = { ...section.mobile, ...section[device] };
            return (
              <fieldset key={device} className="responsive-rule">
                <legend>{device === 'mobile' ? 'Mobile' : 'Desktop'}</legend>
                <SelectField
                  id={`${device}-preset`}
                  label="Chiều rộng nội dung"
                  value={rule.contentPreset}
                  onChange={(e) =>
                    update(
                      {
                        contentPreset: e.target
                          .value as SectionRule['contentPreset'],
                        customMaxWidth: null,
                      },
                      device,
                    )
                  }
                >
                  <option value="full">Toàn khung</option>
                  <option value="information">Thông tin · 420 / 560px</option>
                  <option value="story">Câu chuyện · 480 / 640px</option>
                  <option value="form">Biểu mẫu · 400px</option>
                </SelectField>
                <Field
                  id={`${device}-gap`}
                  label={`Khoảng cách ${device}`}
                  type="number"
                  min={0}
                  max={128}
                  value={rule.gap}
                  onChange={(e) =>
                    update({ gap: Number(e.target.value) }, device)
                  }
                />
                {device === 'desktop' && (
                  <SelectField
                    id="desktop-columns"
                    label="Số cột desktop"
                    value={rule.columns}
                    onChange={(e) =>
                      update(
                        {
                          columns: Number(e.target.value) as 1 | 2,
                          layout: e.target.value === '2' ? 'grid' : 'stack',
                        },
                        device,
                      )
                    }
                  >
                    <option value="1">1 cột</option>
                    <option value="2">2 cột</option>
                  </SelectField>
                )}
              </fieldset>
            );
          })}
          <p className="help-note">
            Lưu mẫu cập nhật kho mẫu; thiệp đã tạo giữ nguyên bản thiết kế đã
            ghim. Đây là mô phỏng trong bộ nhớ.
          </p>
          {error && <Notice tone="error">{error}</Notice>}
        </aside>
        <section className="authoring-canvas responsive-authoring">
          <div className="segmented" aria-label="Kích thước xem trước Admin">
            {([390, 900] as const).map((w) => (
              <button
                key={w}
                aria-pressed={width === w}
                onClick={() => setWidth(w)}
              >
                {w === 390 ? 'Mobile · 390px' : 'Desktop · 900px'}
              </button>
            ))}
          </div>
          <div className="responsive-authoring-scroll">
            <div style={{ width, maxWidth: 'none', marginInline: 'auto' }}>
              <LivePreview
                template={template}
                document={design}
                hostPolicy={width === 900 ? 'adaptive' : 'mobile'}
              />
            </div>
          </div>
        </section>
      </div>
      {publish && (
        <Dialog title="Xuất bản mẫu minh họa" onClose={() => setPublish(false)}>
          <Notice>
            Kiểm tra bản xem trước mobile và desktop trước khi đưa mẫu vào kho
            thiệp.
          </Notice>
          <p>Các thiệp đã tạo giữ nguyên bản thiết kế đã ghim.</p>
          <Button
            onClick={() => {
              setCatalog((all) =>
                all.map((t) =>
                  t.id === id ? { ...t, status: 'PUBLISHED' } : t,
                ),
              );
              setPublish(false);
              toast('Đã xuất bản mẫu minh họa');
            }}
          >
            Xác nhận xuất bản
          </Button>
        </Dialog>
      )}
    </main>
  );
}
