import sys

file_path = 'src/components/views/terminal/views/users/UsersManagementView.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Add Select to imports
if 'import { Select' not in content:
    content = content.replace('import { Switch } from \'' + '@' + '/components/ui/switch\';',
                              'import { Switch } from \'' + '@' + '/components/ui/switch\';\nimport { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from \'' + '@' + '/components/ui/select\';')

# Add handleUpdatePlan to destructuring
content = content.replace('handleDeleteUser, handleResetPassword,', 'handleDeleteUser, handleResetPassword, handleUpdatePlan,')

# Add Plan header
content = content.replace('<th className="p-4 text-center">Estado</th>', '<th className="p-4 text-center">Plan</th>\n                <th className="p-4 text-center">Estado</th>')

# Add Plan cell
plan_cell = """
                  <td className="p-4 text-center">
                    {isAdmin ? (
                      <Select
                        defaultValue={u.plan || 'free'}
                        onValueChange={(val) => handleUpdatePlan(u.id, val)}
                      >
                        <SelectTrigger className="w-[100px] h-8 text-[10px] font-black uppercase">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free" className="text-[10px] font-black uppercase">Gratis</SelectItem>
                          <SelectItem value="pro" className="text-[10px] font-black uppercase">Pro</SelectItem>
                          <SelectItem value="enterprise" className="text-[10px] font-black uppercase">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={cn(
                        "px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest",
                        u.plan === 'pro' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                      )}>
                        {u.plan || 'free'}
                      </span>
                    )}
                  </td>
"""
content = content.replace('<td className="p-4 text-center">\n                    <div className="flex flex-col items-center gap-2">\n                      <Switch', plan_cell + '                  <td className="p-4 text-center">\n                    <div className="flex flex-col items-center gap-2">\n                      <Switch')

# Update colSpan
content = content.replace('colSpan={7}', 'colSpan={8}')

with open(file_path, 'w') as f:
    f.write(content)
