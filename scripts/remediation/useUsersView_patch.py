import sys

file_path = 'src/components/views/terminal/views/users/useUsersView.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Add handleUpdatePlan to the return object and as a function
new_function = """
    const handleUpdatePlan = async (userId: string, plan: string) => {
        try {
            await updateUserMutation.mutateAsync({
                id: userId,
                plan: plan
            });
            toast.success(`Plan actualizado a ${plan.toUpperCase()}`);
        } catch (error: any) {
            toast.error(error.message || 'Error al actualizar el plan');
        }
    };
"""

# Insert before the return statement
content = content.replace('    return {', new_function + '\n    return {')

# Add to the return object
content = content.replace('handleResetPassword,', 'handleResetPassword,\n        handleUpdatePlan,')

with open(file_path, 'w') as f:
    f.write(content)
