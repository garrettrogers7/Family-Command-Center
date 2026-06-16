import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon,
  List, ListOrdered, CheckSquare, Minus,
} from 'lucide-react'

interface Props {
  content:     string
  onChange:    (html: string) => void
  placeholder?: string
}

function ToolBtn({
  onClick, active, title, children,
}: {
  onClick:  () => void
  active?:  boolean
  title:    string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700'
          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
      }`}
    >
      {children}
    </button>
  )
}

export function RichEditor({ content, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: placeholder ?? 'Start writing…' }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // Sync content when switching sections
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (current !== content) {
      editor.commands.setContent(content || '', false)
    }
  }, [content]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!editor) return null

  const Divider = () => <div className="w-px h-4 bg-slate-200 mx-0.5" />

  return (
    <div className="flex flex-col flex-1">
      {/* Toolbar */}
      <div
        className="flex items-center gap-0.5 px-3 py-1.5 flex-wrap sticky z-10"
        style={{
          top: 0,
          borderBottom: '1px solid #e8f0fa',
          backgroundColor: '#fafcff',
        }}
      >
        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold (Cmd+B)">
          <Bold size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic (Cmd+I)">
          <Italic size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline (Cmd+U)">
          <UnderlineIcon size={13} />
        </ToolBtn>

        <Divider />

        <ToolBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          title="Heading"
        >
          <span className="text-[11px] font-bold leading-none">H1</span>
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
          title="Subheading"
        >
          <span className="text-[11px] font-bold leading-none">H2</span>
        </ToolBtn>

        <Divider />

        <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
          <List size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">
          <ListOrdered size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} title="Checklist">
          <CheckSquare size={13} />
        </ToolBtn>

        <Divider />

        <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} active={false} title="Divider line">
          <Minus size={13} />
        </ToolBtn>
      </div>

      {/* Editor body */}
      <EditorContent
        editor={editor}
        className="rich-editor-content flex-1 px-6 py-5 outline-none cursor-text"
        onClick={() => editor.commands.focus()}
      />
    </div>
  )
}
