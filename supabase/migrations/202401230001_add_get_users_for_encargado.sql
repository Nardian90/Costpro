CREATE OR REPLACE FUNCTION get_users_for_encargado(p_user_id uuid)
RETURNS TABLE(user_id uuid) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT usa.user_id
    FROM user_store_access usa
    WHERE usa.store_id IN (
        SELECT store_id
        FROM user_store_access
        WHERE user_id = p_user_id
    );
END;
$$ LANGUAGE plpgsql;
